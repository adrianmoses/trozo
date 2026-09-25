"""Threshold sweep over a recorded full-mode eval run (feature 003).

    uv run tune.py results/<stamp>-p1-dev-full.jsonl

No LLM calls: labels are recomputed from the signals stored in the JSONL,
with the seed rule masked. Prints precision and coverage of `high` for each
(T_high, T_med) pair, for chunks and for alternatives.
"""

import argparse
import json
import sys
from pathlib import Path

from confidence_metrics import sweep, targets
from run import SEED_PATH, surface_matches

import yaml


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("jsonl", type=Path)
    args = ap.parse_args()
    items = {i["id"]: i for i in yaml.safe_load(SEED_PATH.read_text(encoding="utf-8"))}
    rows = []
    for line in args.jsonl.read_text(encoding="utf-8").splitlines():
        rec = json.loads(line)
        if "response" in rec:
            rows.extend(targets(items[rec["id"]], rec["response"], surface_matches))
    if not any(r["consistency"] is not None or r["verifier"] is not None for r in rows):
        print("no full-mode signals in this file (run with --confidence full)", file=sys.stderr)
        return 1
    for kind in ("chunk", "alt"):
        subset = [r for r in rows if r["kind"] == kind]
        base = sum(r["correct"] for r in subset) / len(subset) if subset else 0
        print(f"\n{kind}s: n={len(subset)} base rate={base:.2f}")
        print(" T_high T_med | high n  prec  coverage | low n  acc")
        for s in sweep(subset):
            prec = "  -  " if s["high_precision"] is None else f"{s['high_precision']:.2f}"
            lacc = "  -  " if s["low_accuracy"] is None else f"{s['low_accuracy']:.2f}"
            print(f"   {s['t_high']:.1f}   {s['t_med']:.1f}  |  {s['high_n']:4d}  {prec}   {s['coverage']:.2f}   |  {s['low_n']:4d}  {lacc}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
