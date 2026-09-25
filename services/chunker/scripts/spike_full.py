"""003 validation spike: sample variance, verifier quality, tuning feasibility.

    uv run scripts/spike_full.py [--perturb] [--reuse PATH]

Uses cached fast responses for the dev split (run evals first), runs N
samples per item and the verifier claims through each candidate model, runs
the poison set, and sweeps thresholds. Raw signals are saved so re-analysis
(--reuse) makes no LLM calls.
"""

import argparse
import json
import sys
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).parents[1]))

from app.llm import AnthropicLLMClient, OpenAILLMClient  # noqa: E402
from app.main import _user_message  # noqa: E402
from app.models import Region  # noqa: E402
from app.pipeline import cache  # noqa: E402
from app.pipeline.full import (  # noqa: E402
    N_SAMPLES,
    VERIFIER_SYSTEM,
    Claim,
    VerifierAnswers,
    _run_sample,
    build_claims,
    consistency,
    full_confidence,
    map_answer,
    sample_prompt,
    verifier_user_message,
)
from app.pipeline.normalize import normalize_input  # noqa: E402
from app.pipeline.spanish import keys_overlap, lemma_key  # noqa: E402
from app.prompts import current_version, load_prompt  # noqa: E402

ROOT = Path(__file__).parents[3]
SEED = ROOT / "evals" / "seed" / "seed_v0.yaml"
POISON = ROOT / "evals" / "seed" / "poison_v0.yaml"
RESULTS = ROOT / "evals" / "results"
CANDIDATES = ["gpt-5.5", "gpt-5.4-mini"]


def collect(perturb: bool) -> dict:
    llm = AnthropicLLMClient()
    version = current_version()
    system = load_prompt(version)
    items = [i for i in yaml.safe_load(SEED.read_text()) if i["split"] == "dev"]
    rows = []
    jobs = []
    with ThreadPoolExecutor(max_workers=10) as pool:
        for item in items:
            text = normalize_input(item["input"])
            payload = cache.get(cache.cache_key(text, "neutral", version, llm.model))
            if payload is None:
                print(f"skip {item['id']}: no cached fast response", file=sys.stderr)
                continue
            user = _user_message(text, Region.neutral)
            futs = [
                pool.submit(_run_sample, llm, sample_prompt(system, i, perturb), user)
                for i in range(N_SAMPLES)
            ]
            jobs.append((item, payload, futs))
        for item, payload, futs in jobs:
            samples = [k for f in futs if (k := f.result()) is not None]
            rows.append({"item": item, "payload": payload, "samples": samples})

    verifier_answers: dict[str, dict] = {}
    poison = yaml.safe_load(POISON.read_text())
    poison_answers: dict[str, dict] = {}
    for model in CANDIDATES:
        v = OpenAILLMClient(model)
        t0 = time.time()
        with ThreadPoolExecutor(max_workers=8) as pool:
            futs = {
                r["item"]["id"]: pool.submit(
                    v.generate_structured,
                    VERIFIER_SYSTEM,
                    verifier_user_message(build_claims(r["payload"])),
                    VerifierAnswers,
                )
                for r in rows
            }
            pclaims = [Claim(id=p["id"], text=p["claim"]) for p in poison]
            pfut = pool.submit(
                v.generate_structured, VERIFIER_SYSTEM, verifier_user_message(pclaims), VerifierAnswers
            )
            verifier_answers[model] = {
                iid: {a.id: a.answer for a in f.result().answers} for iid, f in futs.items()
            }
            poison_answers[model] = {a.id: a.answer for a in pfut.result().answers}
        print(f"{model}: verifier pass {time.time() - t0:.1f}s", file=sys.stderr)
    return {
        "perturb": perturb,
        "rows": rows,
        "verifier": verifier_answers,
        "poison": poison_answers,
        "poison_set": poison,
    }


def analyse(data: dict) -> None:
    rows = data["rows"]
    print(f"\n== spike (perturb={data['perturb']}), {len(rows)} dev items ==")
    shares = []
    targets = []  # (correct, consistency, {model: verifier})
    for r in rows:
        expected = [lemma_key(e["surface"]) for e in r["item"].get("expected_chunks", [])]
        for chunk in r["payload"]["chunks"]:
            share = consistency(chunk["surface"], r["samples"])
            shares.append(share)
            key = lemma_key(chunk["surface"])
            correct = any(keys_overlap(key, e) for e in expected if e)
            ver = {m: map_answer(data["verifier"][m].get(r["item"]["id"], {}).get(chunk["id"])) for m in data["verifier"]}
            targets.append((correct, share, ver))
    n = len(shares)
    ones = sum(1 for s in shares if s == 1.0)
    print(f"chunks: {n}; samples per item: {[len(r['samples']) for r in rows]}")
    print("consistency distribution:", dict(sorted(Counter(shares).items(), key=lambda kv: (kv[0] is None, kv[0]))))
    print(f"share at 1.0: {ones}/{n} = {ones / n:.0%}  (rule: >80% -> perturb)")
    base = sum(c for c, _, _ in targets) / n
    print(f"base rate (chunk matches an expected chunk): {base:.2f}")

    print("\n-- verifier on dev chunks (agree rate / agree-when-correct / agree-when-incorrect) --")
    for m in data["verifier"]:
        ag = [v[m] == "agree" for _, _, v in targets]
        corr = [v[m] == "agree" for c, _, v in targets if c]
        inc = [v[m] == "agree" for c, _, v in targets if not c]
        rate = lambda xs: f"{sum(xs)}/{len(xs)}" if xs else "-"
        print(f"{m:14s} agree {rate(ag)}  |correct {rate(corr)}  |incorrect {rate(inc)}")

    print("\n-- poison set --")
    truth = {p["id"]: p["truth"] for p in data["poison_set"]}
    for m, answers in data["poison"].items():
        false_ids = [i for i, t in truth.items() if not t]
        true_ids = [i for i, t in truth.items() if t]
        caught = sum(1 for i in false_ids if answers.get(i) == "no")
        accepted = sum(1 for i in true_ids if answers.get(i) == "yes")
        missed = [i for i in false_ids if answers.get(i) != "no"]
        print(f"{m:14s} catch {caught}/{len(false_ids)} = {caught / len(false_ids):.0%}  controls accepted {accepted}/{len(true_ids)}  missed={missed}")

    print("\n-- threshold sweep (seed masked), per verifier model --")
    for m in data["verifier"]:
        best = None
        print(f"{m}:  T_high T_med | high: n prec | med+high: n prec")
        for th in (0.6, 0.8, 1.0):
            for tm in (0.2, 0.4, 0.6):
                if tm > th:
                    continue
                labels = [(c, full_confidence(False, s, v[m], th, tm)) for c, s, v in targets]
                hi = [c for c, l in labels if l == "high"]
                mh = [c for c, l in labels if l in ("high", "med")]
                ph = sum(hi) / len(hi) if hi else float("nan")
                pm = sum(mh) / len(mh) if mh else float("nan")
                print(f"           {th:.1f}   {tm:.1f}  |  {len(hi):3d} {ph:.2f} |  {len(mh):3d} {pm:.2f}")
                if hi and (best is None or (ph, len(hi)) > (best[2], best[3])):
                    best = (th, tm, ph, len(hi))
        print(f"  best high precision: T_high={best[0]} T_med={best[1]} prec={best[2]:.2f} n={best[3]} vs base {base:.2f}" if best else "  no high labels")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--perturb", action="store_true")
    ap.add_argument("--reuse", type=Path)
    args = ap.parse_args()
    if args.reuse:
        data = json.loads(args.reuse.read_text())
    else:
        data = collect(args.perturb)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        out = RESULTS / f"{stamp}-spike003{'-perturb' if args.perturb else ''}.json"
        out.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        print(f"saved {out}", file=sys.stderr)
    analyse(data)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
