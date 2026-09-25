"""Confidence metrics for the eval harness (feature 003).

The label rules are duplicated from services/chunker/app/pipeline/full.py
(`full_confidence`) on purpose: evals keep their own environment and must not
import the service. Keep the two in sync.

Seed masking: every expected chunk is in the seed, so rule 1 ("seed match ->
high") would make precision trivially perfect. Metrics recompute labels from
consistency + verifier only.

Correctness is pessimistic: a chunk counts as correct only when it matches
an expected chunk for its seed item (the runner's recall matcher).
"""

from __future__ import annotations

from collections import Counter

DEFAULT_T_HIGH = 1.0  # fallback only; the runner reads thresholds from /v1/meta
DEFAULT_T_MED = 0.6
LABELS = ("high", "med", "low", "unrated")


def label_from_signals(
    consistency: float | None, verifier: str | None, t_high: float, t_med: float
) -> str:
    agrees = verifier == "agree"
    if consistency is not None and consistency >= t_high and agrees:
        return "high"
    if (consistency is not None and consistency >= t_med) or agrees:
        return "med"
    if consistency is None and verifier is None:
        return "unrated"
    return "low"


def targets(item: dict, response: dict, matcher) -> list[dict]:
    """One row per chunk and per alternative with signals and correctness.
    `matcher(surface, expected_surface) -> bool` is the runner's recall test."""
    expected = [e["surface"] for e in item.get("expected_chunks", [])]
    rows = []
    for chunk in response.get("chunks", []):
        entries = [("chunk", chunk)] + [("alt", a) for a in chunk.get("alternatives", [])]
        for kind, entry in entries:
            conf = entry.get("confidence") or {}
            sig = conf.get("signals") or {}
            rows.append(
                {
                    "kind": kind,
                    "surface": entry["surface"],
                    "label": conf.get("label"),
                    "seed": bool(sig.get("seed")),
                    "consistency": sig.get("consistency"),
                    "verifier": sig.get("verifier"),
                    "correct": any(matcher(entry["surface"], e) for e in expected),
                }
            )
    return rows


def _precision(rows: list[dict]) -> float | None:
    return sum(r["correct"] for r in rows) / len(rows) if rows else None


def summarise(rows: list[dict], t_high: float, t_med: float) -> dict:
    """Metrics for one kind of target (chunks or alternatives)."""
    if not rows:
        return {"n": 0}
    masked = [dict(r, masked=label_from_signals(r["consistency"], r["verifier"], t_high, t_med)) for r in rows]
    buckets = {
        label: {"n": len(bs), "accuracy": _precision(bs)}
        for label in LABELS
        if (bs := [r for r in masked if r["masked"] == label])
    }
    high = [r for r in masked if r["masked"] == "high"]
    with_verifier = [r for r in rows if r["verifier"] is not None]
    return {
        "n": len(rows),
        "base_rate": _precision(rows),
        "high_precision_masked": _precision(high),
        "high_coverage_masked": len(high) / len(rows),
        "buckets_masked": buckets,
        "consistency_hist": {
            str(k): v for k, v in sorted(Counter(r["consistency"] for r in rows).items(), key=lambda kv: (kv[0] is None, kv[0] or 0))
        },
        "verifier_agree_rate": (
            sum(r["verifier"] == "agree" for r in with_verifier) / len(with_verifier)
            if with_verifier
            else None
        ),
        "served_labels": dict(Counter(r["label"] for r in rows)),
    }


def sweep(rows: list[dict], t_highs=(0.6, 0.7, 0.8, 0.9, 1.0), t_meds=(0.2, 0.4, 0.6, 0.8)) -> list[dict]:
    out = []
    for th in t_highs:
        for tm in t_meds:
            if tm > th:
                continue
            labels = [label_from_signals(r["consistency"], r["verifier"], th, tm) for r in rows]
            high = [r for r, lab in zip(rows, labels) if lab == "high"]
            low = [r for r, lab in zip(rows, labels) if lab == "low"]
            out.append(
                {
                    "t_high": th,
                    "t_med": tm,
                    "high_n": len(high),
                    "high_precision": _precision(high),
                    "coverage": len(high) / len(rows) if rows else 0.0,
                    "low_n": len(low),
                    "low_accuracy": _precision(low),
                }
            )
    return out
