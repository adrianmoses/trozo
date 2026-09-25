"""Full-mode confidence (003): self-consistency samples + a verifier model.

Signals are derived, never model-reported. Full mode rescores the fast
response: it never changes chunk ids, text or order, only `confidence`.
Rules (ARCHITECTURE), first match wins:
  seed match                                  -> high ("verified")
  consistency >= T_HIGH and verifier agrees   -> high
  consistency >= T_MED  or  verifier agrees   -> med
  some signal present                         -> low
  no signal at all                            -> unrated
"""

from __future__ import annotations

import copy
import itertools
import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.llm import LLMClient
from app.models import LLMDraft
from app.pipeline.spanish import keys_overlap, lemma_key
from app.pipeline.validate import validate_repair

log = logging.getLogger("chunker.full")

N_SAMPLES = 5
MIN_SAMPLES = 3
# Tuned on the dev split (003): with N=5, consistency moves in 0.2 steps, so
# T_HIGH = 1.0 means "all samples agree". It raised seed-masked high precision
# from 0.93 to 1.00 on chunks and 0.42 to 0.54 on alternatives. T_MED stays at
# ARCHITECTURE's 0.6; moving it changed a single alternative.
T_HIGH = 1.0
T_MED = 0.6

EXAMPLES_HEADING = "## Examples\n"


# --- Sampling -----------------------------------------------------------------


def sample_prompt(base: str, i: int, perturb: bool) -> str:
    """System prompt for sample i. Identity unless `perturb`, in which case the
    few-shot blocks under `## Examples` are reordered (a different permutation
    per sample). The prompt file itself is never edited."""
    if not perturb or EXAMPLES_HEADING not in base:
        return base
    head, examples = base.split(EXAMPLES_HEADING, 1)
    blocks = [b.strip() for b in examples.strip().split("\n\nInput (")]
    blocks = [blocks[0]] + [f"Input ({b}" for b in blocks[1:]]
    if len(blocks) < 2:
        return base
    perms = list(itertools.permutations(range(len(blocks))))[1:]  # skip identity
    order = perms[i % len(perms)]
    return head + EXAMPLES_HEADING + "\n" + "\n\n".join(blocks[j] for j in order) + "\n"


def sample_keys(draft: LLMDraft) -> list[str]:
    """Lemma keys of every chunk and alternative surface in one sample."""
    keys: list[str] = []
    for chunk in draft.chunks:
        keys.append(lemma_key(chunk.surface))
        keys.extend(lemma_key(alt.surface) for alt in chunk.alternatives)
    return [k for k in keys if k]


def consistency(target_surface: str, samples: list[list[str]]) -> float | None:
    """Share of samples containing the target (lemma-key overlap, the matcher
    the seed index uses). None when too few samples succeeded."""
    if len(samples) < MIN_SAMPLES:
        return None
    target = lemma_key(target_surface)
    if not target:
        return None
    hits = 0
    for keys in samples:
        if any(keys_overlap(target, k) for k in keys):
            hits += 1
        else:
            near = [k for k in keys if set(k.split()) & set(target.split())]
            if near:
                log.info("consistency near-miss: %r vs %r", target, near)
    return round(hits / len(samples), 4)


# --- Verifier -----------------------------------------------------------------


class Claim(BaseModel):
    id: str
    text: str


class VerifierAnswer(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    answer: Literal["yes", "no", "unsure"]
    reason: str


class VerifierAnswers(BaseModel):
    model_config = ConfigDict(extra="forbid")
    answers: list[VerifierAnswer]


VERIFIER_SYSTEM = """You check claims about Spanish usage for a language-learning tool.

For each numbered claim, answer:
- "yes" if the claim is true as stated: the expression is natural and commonly used with that meaning, in the regions named;
- "no" if it is false: wrong meaning, unnatural, a calque, or not characteristic of the named region;
- "unsure" if you genuinely cannot tell.

Judge each claim independently. Do not assume a claim is true because it was asked. Region claims matter: an expression used everywhere is fine for "most of the Spanish-speaking world", but a regionalism attributed to the wrong country is "no".

Return one answer per claim id with a one-line reason."""

REGION_NAMES = {"ES": "Spain", "MX": "Mexico", "AR": "Argentina", "CO": "Colombia"}


def _region_phrase(regions: list[str]) -> str:
    countries = [REGION_NAMES[r] for r in regions if r in REGION_NAMES]
    if not countries:
        return "across most of the Spanish-speaking world"
    return "in " + " and ".join(countries)


def build_claims(payload: dict) -> list[Claim]:
    claims: list[Claim] = []
    for chunk in payload.get("chunks", []):
        slots = " ".join(chunk.get("slots") or [])
        expr = f"{chunk['pattern']} {slots}".strip()
        gloss = chunk["gloss_en"]
        claims.append(
            Claim(
                id=chunk["id"],
                text=f'"{expr}" is commonly used {_region_phrase(chunk.get("regions") or [])} '
                f'to mean "{gloss}".',
            )
        )
        for j, alt in enumerate(chunk.get("alternatives") or []):
            claims.append(
                Claim(
                    id=f"{chunk['id']}.alt_{j}",
                    text=f'"{alt["surface"]}" is a common way to say "{gloss}" '
                    f"{_region_phrase(alt.get('regions') or [])}.",
                )
            )
    return claims


def verifier_user_message(claims: list[Claim]) -> str:
    return "Claims:\n" + "\n".join(f"[{c.id}] {c.text}" for c in claims)


def map_answer(answer: str | None) -> str | None:
    return {"yes": "agree", "no": "disagree", "unsure": "unsure"}.get(answer or "")


# --- Labels -------------------------------------------------------------------


def full_confidence(
    seed: bool,
    consistency_share: float | None,
    verifier: str | None,
    t_high: float = T_HIGH,
    t_med: float = T_MED,
) -> str:
    if seed:
        return "high"
    agrees = verifier == "agree"
    if consistency_share is not None and consistency_share >= t_high and agrees:
        return "high"
    if (consistency_share is not None and consistency_share >= t_med) or agrees:
        return "med"
    if consistency_share is None and verifier is None:
        return "unrated"
    return "low"


# --- Orchestration --------------------------------------------------------------


def _run_sample(llm: LLMClient, system: str, user: str) -> list[str] | None:
    try:
        draft = llm.generate_structured(system, user, LLMDraft)
    except Exception as exc:  # a failed sample is dropped, never fatal
        log.warning("sample failed: %s", exc)
        return None
    repaired, _ = validate_repair(draft)
    return sample_keys(repaired)


def _run_verifier(verifier: LLMClient | None, claims: list[Claim]) -> dict[str, str] | None:
    if verifier is None or not claims:
        return None
    try:
        result = verifier.generate_structured(
            VERIFIER_SYSTEM, verifier_user_message(claims), VerifierAnswers
        )
    except Exception as exc:  # verifier failure degrades to consistency-only
        log.warning("verifier failed: %s", exc)
        return None
    return {a.id: a.answer for a in result.answers}


def score_full(
    fast_payload: dict,
    llm: LLMClient,
    verifier: LLMClient | None,
    system: str,
    user: str,
    *,
    n_samples: int = N_SAMPLES,
    perturb: bool = False,
    t_high: float = T_HIGH,
    t_med: float = T_MED,
) -> dict:
    """Rescore a fast response with samples and verifier, concurrently."""
    payload = copy.deepcopy(fast_payload)
    claims = build_claims(payload)
    with ThreadPoolExecutor(max_workers=n_samples + 1) as pool:
        sample_futures = [
            pool.submit(_run_sample, llm, sample_prompt(system, i, perturb), user)
            for i in range(n_samples)
        ]
        verifier_future = pool.submit(_run_verifier, verifier, claims)
        samples = [k for f in sample_futures if (k := f.result()) is not None]
        answers = verifier_future.result()

    def rescore(target: dict, claim_id: str) -> None:
        conf = target.setdefault("confidence", {"label": "unrated"})
        signals = conf.setdefault("signals", {})
        seed = bool(signals.get("seed"))
        signals["consistency"] = consistency(target["surface"], samples)
        signals["verifier"] = map_answer(answers.get(claim_id)) if answers else None
        conf["label"] = full_confidence(
            seed, signals["consistency"], signals["verifier"], t_high, t_med
        )

    for chunk in payload.get("chunks", []):
        rescore(chunk, chunk["id"])
        for j, alt in enumerate(chunk.get("alternatives") or []):
            rescore(alt, f"{chunk['id']}.alt_{j}")
    log.info(
        "full: %d/%d samples, verifier=%s", len(samples), n_samples, answers is not None
    )
    return payload


def relabel(payload: dict, t_high: float = T_HIGH, t_med: float = T_MED) -> dict:
    """Recompute labels from stored signals. Signals are what the cache keeps
    durable; labels follow the current thresholds, so re-tuning needs no
    cache eviction."""
    for chunk in payload.get("chunks", []):
        for target in [chunk, *(chunk.get("alternatives") or [])]:
            conf = target.get("confidence") or {}
            sig = conf.get("signals") or {}
            conf["label"] = full_confidence(
                bool(sig.get("seed")), sig.get("consistency"), sig.get("verifier"), t_high, t_med
            )
    return payload
