"""Re-score a stored eval run with the current seed and scoring (feature 005).

    uv run rescore.py results/<stamp>-p1-test-full.jsonl
    uv run rescore.py results/<stamp>-p1-test-full.jsonl --primary-only

No service and no LLM calls: every JSONL record holds the full response, so
recall, calques, region metrics and confidence metrics are recomputed from
it. Writes `<name>-rescored[-primary-only].summary.json` and `.md` next to the
input; the report's deltas compare with the run's original summary, if any.
"""

import argparse
import json
import sys
from pathlib import Path

import yaml

from confidence_metrics import DEFAULT_T_HIGH, DEFAULT_T_MED
from run import SEED_PATH, build_row, print_run, summarise_run, write_report


def parse_name(path: Path) -> tuple[str, str, str, str]:
    """`<stamp>-<prompt>-<split>[-<mode>].jsonl` -> (stamp, prompt, split, mode).
    Runs from before 003 have no mode suffix and are fast mode."""
    parts = path.stem.split("-")
    stamp, prompt, split = parts[0], parts[1], parts[2]
    mode = parts[3] if len(parts) > 3 else "fast"
    return stamp, prompt, split, mode


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("jsonl", type=Path)
    ap.add_argument("--seed", type=Path, default=SEED_PATH)
    ap.add_argument("--primary-only", action="store_true",
                    help="drop `accepted:` and `also_valid:`: score as before 005")
    ap.add_argument("--t-high", type=float, default=None)
    ap.add_argument("--t-med", type=float, default=None)
    args = ap.parse_args()

    seed = {i["id"]: i for i in yaml.safe_load(args.seed.read_text(encoding="utf-8")) or []}
    if args.primary_only:
        for item in seed.values():
            item.pop("also_valid", None)
            for exp in item.get("expected_chunks", []):
                exp.pop("accepted", None)

    records = [json.loads(line) for line in args.jsonl.read_text(encoding="utf-8").splitlines() if line]
    missing = [r["id"] for r in records if r["id"] not in seed]
    if missing:
        print(f"items not in the seed, skipped: {missing}", file=sys.stderr)
    records = [r for r in records if r["id"] in seed]
    items = [seed[r["id"]] for r in records]
    rows = [build_row(seed[r["id"]], r) for r in records]

    stamp, prompt, split, mode = parse_name(args.jsonl)
    original = args.jsonl.with_suffix(".summary.json")
    original_summary = json.loads(original.read_text(encoding="utf-8")) if original.is_file() else {}
    thresholds = original_summary.get("thresholds") or {}
    service_model = next((r["response"]["meta"]["model"] for r in records if "response" in r), None)
    summary = summarise_run(
        rows,
        items,
        stamp=f"{stamp} (re-scored)",
        prompt=prompt,
        split=split,
        mode=mode,
        service_model=service_model,
        verifier_model=original_summary.get("verifier_model"),
        t_high=args.t_high if args.t_high is not None else thresholds.get("t_high", DEFAULT_T_HIGH),
        t_med=args.t_med if args.t_med is not None else thresholds.get("t_med", DEFAULT_T_MED),
    )
    print_run(rows, summary)

    suffix = "-rescored" + ("-primary-only" if args.primary_only else "")
    out = args.jsonl.with_name(args.jsonl.stem + suffix)
    out.with_suffix(".summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
    write_report(out.with_suffix(".md"), summary, (original, original_summary) if original_summary else None)
    print(f"report: {out.with_suffix('.md')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
