"""trozo eval runner.

Calls the running chunk service over HTTP for each seed item and reports
chunk recall and calque rate; in full-confidence mode also high-label
precision (seed masked), calibration by bucket, the consistency histogram and
verifier agreement. Writes raw results as JSONL, a summary JSON, and a
Markdown report with deltas against the previous comparable run.

    uv run run.py --prompt p1 --model primary --split dev
    uv run run.py --prompt p1 --model primary --split dev --confidence full --verifier gpt-5.4-mini
"""

import argparse
import json
import os
import re
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

import httpx2
import yaml

from confidence_metrics import DEFAULT_T_HIGH, DEFAULT_T_MED, summarise, targets

SEED_PATH = Path(__file__).parent / "seed" / "seed_v0.yaml"
RESULTS_DIR = Path(__file__).parent / "results"

_PARENS = re.compile(r"\([^)]*\)")
_SLOT_TAIL = re.compile(r"\+\s*\S+\.?")
MAX_GAP = 2


def norm_tokens(text: str) -> list[str]:
    """Citation-form normalization: lowercase, accents stripped, parens and
    slot pills removed. NOTE: no lemmatization — a lighter cousin of the
    service's spaCy matcher; parity tuning is feature 005's concern."""
    text = _PARENS.sub(" ", text.lower())
    text = _SLOT_TAIL.sub(" ", text)
    decomposed = unicodedata.normalize("NFD", text)
    text = "".join(c for c in decomposed if not unicodedata.combining(c))
    return re.findall(r"[a-z0-9ñ]+", text)


def contains_tokens(haystack: list[str], needle: list[str], max_gap: int = MAX_GAP) -> bool:
    if not needle:
        return False
    for start in range(len(haystack)):
        if haystack[start] != needle[0]:
            continue
        pos = start
        ok = True
        for target in needle[1:]:
            nxt = next(
                (j for j in range(pos + 1, min(pos + 2 + max_gap, len(haystack)))
                 if haystack[j] == target),
                None,
            )
            if nxt is None:
                ok = False
                break
            pos = nxt
        if ok:
            return True
    return False


def surface_matches(surface: str, expected: str) -> bool:
    """Recall matcher for one surface against one expected surface."""
    a, b = norm_tokens(surface), norm_tokens(expected)
    return contains_tokens(a, b) or contains_tokens(b, a)


def surfaces_in_response(response: dict) -> list[str]:
    out = []
    for chunk in response.get("chunks", []):
        out.append(chunk["surface"])
        out.extend(alt["surface"] for alt in chunk.get("alternatives", []))
    return out


def texts_in_response(response: dict) -> list[str]:
    """Translation, chunk/alternative surfaces, and example sentences —
    everywhere a forbidden phrase counts. Notes are excluded: quoting the
    trap in a warning is the point, not a violation."""
    out = [response.get("translation", "")]
    for chunk in response.get("chunks", []):
        out.append(chunk["surface"])
        out.append(chunk["example"]["es"])
        for alt in chunk.get("alternatives", []):
            out.extend([alt["surface"], alt["example_es"]])
    return out


def score_item(item: dict, response: dict) -> dict:
    surfaces = [norm_tokens(s) for s in surfaces_in_response(response)]
    expected = item.get("expected_chunks", [])
    found = []
    for exp in expected:
        needle = norm_tokens(exp["surface"])
        hit = any(
            contains_tokens(surface, needle) or contains_tokens(needle, surface)
            for surface in surfaces
        )
        found.append({"surface": exp["surface"], "found": hit})
    texts = [norm_tokens(t) for t in texts_in_response(response)]
    violations = [
        phrase
        for phrase in item.get("forbidden", [])
        if any(contains_tokens(t, norm_tokens(phrase)) for t in texts)
    ]
    note_kinds = {n["kind"] for n in response.get("notes", [])}
    expected_kinds = item.get("expected_note_kinds", [])
    return {
        "recall": (sum(1 for f in found if f["found"]) / len(found)) if found else None,
        "found": found,
        "calque_violations": violations,
        "note_kinds_found": sorted(note_kinds & set(expected_kinds)),
        "note_kinds_expected": expected_kinds,
    }


def previous_summary(split: str, prompt: str, mode: str, exclude: Path) -> tuple[Path, dict] | None:
    candidates = sorted(RESULTS_DIR.glob(f"*-{prompt}-{split}-{mode}.summary.json"))
    candidates = [c for c in candidates if c != exclude]
    if not candidates:
        return None
    return candidates[-1], json.loads(candidates[-1].read_text(encoding="utf-8"))


def _fmt(value) -> str:
    if value is None:
        return "–"
    return f"{value:.2f}" if isinstance(value, float) else str(value)


def _delta(now, before) -> str:
    if not isinstance(now, (int, float)) or not isinstance(before, (int, float)):
        return ""
    d = now - before
    return "±0.00" if abs(d) < 1e-9 else f"{d:+.2f}"


def write_report(path: Path, summary: dict, previous: tuple[Path, dict] | None) -> None:
    lines = [
        f"# Eval run {summary['stamp']}",
        "",
        f"prompt `{summary['prompt']}` · split `{summary['split']}` · confidence `{summary['mode']}` · "
        f"model `{summary['service_model']}` · verifier `{summary.get('verifier_model') or '–'}`",
        "",
    ]
    prev = previous[1] if previous else None
    lines.append(f"Compared with: `{previous[0].name}`" if previous else "Compared with: no previous comparable run.")
    lines += ["", "| Metric | Value | Δ vs previous |", "| --- | --- | --- |"]
    headline = [("items", "items"), ("chunk recall", "chunk_recall"), ("calque rate", "calque_rate")]
    conf = summary.get("confidence") or {}
    pconf = (prev or {}).get("confidence") or {}
    for label, key in headline:
        lines.append(f"| {label} | {_fmt(summary[key])} | {_delta(summary[key], (prev or {}).get(key))} |")
    for kind in ("chunk", "alt"):
        c, pc = conf.get(kind) or {}, pconf.get(kind) or {}
        if not c.get("n"):
            continue
        name = "chunks" if kind == "chunk" else "alternatives"
        for label, key in (
            ("high precision (seed masked)", "high_precision_masked"),
            ("high coverage (seed masked)", "high_coverage_masked"),
            ("base rate (matches expected)", "base_rate"),
            ("verifier agree rate", "verifier_agree_rate"),
        ):
            lines.append(f"| {name}: {label} | {_fmt(c.get(key))} | {_delta(c.get(key), pc.get(key))} |")
    for kind in ("chunk", "alt"):
        c = conf.get(kind) or {}
        if not c.get("n"):
            continue
        lines += ["", f"### Calibration, {'chunks' if kind == 'chunk' else 'alternatives'} (seed masked)", "",
                  "| Label | n | Accuracy |", "| --- | --- | --- |"]
        for label, b in c["buckets_masked"].items():
            lines.append(f"| {label} | {b['n']} | {_fmt(b['accuracy'])} |")
        lines += ["", f"Consistency histogram: {c['consistency_hist']}"]
    failing_now = {i["id"] for i in summary["per_item"] if i["failing"]}
    failing_before = {i["id"] for i in (prev or {}).get("per_item", []) if i["failing"]}
    newly = sorted(failing_now - failing_before) if prev else sorted(failing_now)
    lines += ["", "### Newly failing items" if prev else "### Failing items", ""]
    lines += [f"- `{i}`" for i in newly] or ["None."]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="trozo eval runner")
    parser.add_argument("--prompt", default="p1")
    parser.add_argument("--model", default="primary")
    parser.add_argument("--split", default="dev", choices=["dev", "test", "all"])
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument("--region", default="neutral")
    parser.add_argument("--confidence", default="fast", choices=["fast", "full"])
    parser.add_argument(
        "--verifier",
        default=None,
        help="expected verifier model (full mode); warns if the service reports another",
    )
    parser.add_argument(
        "--token",
        default=os.environ.get("CHUNKER_TOKEN"),
        help="service token sent as Authorization: Bearer (default: $CHUNKER_TOKEN)",
    )
    args = parser.parse_args()

    items = yaml.safe_load(SEED_PATH.read_text(encoding="utf-8")) or []
    if args.split != "all":
        items = [i for i in items if i.get("split") == args.split]
    if not items:
        print(f"no seed items for split={args.split}", file=sys.stderr)
        return 1

    headers = {"Authorization": f"Bearer {args.token}"} if args.token else {}
    client = httpx2.Client(base_url=args.base_url, timeout=120, headers=headers)
    meta = client.get("/v1/meta").json()
    if args.confidence == "full" and args.verifier and meta.get("verifier_model") != args.verifier:
        print(
            f"warning: service verifier_model={meta.get('verifier_model')} != requested {args.verifier}",
            file=sys.stderr,
        )
    if meta.get("prompt_version") != args.prompt:
        print(
            f"warning: service prompt_version={meta.get('prompt_version')} "
            f"!= requested {args.prompt}",
            file=sys.stderr,
        )

    RESULTS_DIR.mkdir(exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out_path = RESULTS_DIR / f"{stamp}-{args.prompt}-{args.split}-{args.confidence}.jsonl"

    rows = []
    service_model = None
    with out_path.open("w", encoding="utf-8") as out:
        for item in items:
            resp = client.post(
                "/v1/chunk",
                json={
                    "text": item["input"],
                    "preferred_region": args.region,
                    "confidence_mode": args.confidence,
                },
            )
            if resp.status_code != 200:
                record = {"id": item["id"], "error": resp.json(), "status": resp.status_code}
                rows.append({"id": item["id"], "tier": item["tier"], "recall": None,
                             "violations": ["<request failed>"], "cached": False})
            else:
                body = resp.json()
                service_model = service_model or body["meta"]["model"]
                scores = score_item(item, body)
                record = {"id": item["id"], "tier": item["tier"], "split": item.get("split"),
                          "scores": scores, "response": body}
                rows.append({
                    "id": item["id"],
                    "tier": item["tier"],
                    "recall": scores["recall"],
                    "violations": scores["calque_violations"],
                    "cached": body["meta"]["cached"],
                    "targets": targets(item, body, surface_matches),
                })
            out.write(json.dumps(record, ensure_ascii=False) + "\n")

    print(f"\n{'id':<16} {'tier':<10} {'recall':>7} {'calque':>7} {'cached':>7}")
    for row in rows:
        recall = "-" if row["recall"] is None else f"{row['recall']:.2f}"
        print(f"{row['id']:<16} {row['tier']:<10} {recall:>7} "
              f"{'FAIL' if row['violations'] else 'ok':>7} {str(row['cached']):>7}")

    scored = [r["recall"] for r in rows if r["recall"] is not None]
    chunk_recall = sum(scored) / len(scored) if scored else 0.0
    calque_rate = sum(1 for r in rows if r["violations"]) / len(rows)
    print(f"\nitems: {len(rows)}  chunk recall: {chunk_recall:.2f}  "
          f"calque rate: {calque_rate:.2f}")

    thresholds = meta.get("full_confidence") or {}
    t_high = thresholds.get("t_high", DEFAULT_T_HIGH)
    t_med = thresholds.get("t_med", DEFAULT_T_MED)
    confidence = None
    if args.confidence == "full":
        all_targets = [t for r in rows for t in r.get("targets", [])]
        confidence = {
            kind: summarise([t for t in all_targets if t["kind"] == kind], t_high, t_med)
            for kind in ("chunk", "alt")
        }
        for kind, label in (("chunk", "chunks"), ("alt", "alternatives")):
            c = confidence[kind]
            if not c.get("n"):
                continue
            print(
                f"{label}: n={c['n']}  high precision (seed masked): {_fmt(c['high_precision_masked'])}"
                f"  coverage: {_fmt(c['high_coverage_masked'])}  base rate: {_fmt(c['base_rate'])}"
                f"  verifier agree: {_fmt(c['verifier_agree_rate'])}"
            )
            print(
                "  calibration: "
                + "  ".join(f"{k} {b['n']}@{_fmt(b['accuracy'])}" for k, b in c["buckets_masked"].items())
            )
            print(f"  consistency: {c['consistency_hist']}")

    summary = {
        "stamp": stamp,
        "prompt": args.prompt,
        "split": args.split,
        "mode": args.confidence,
        "service_model": service_model,
        "verifier_model": meta.get("verifier_model") if args.confidence == "full" else None,
        "thresholds": {"t_high": t_high, "t_med": t_med},
        "items": len(rows),
        "chunk_recall": round(chunk_recall, 4),
        "calque_rate": round(calque_rate, 4),
        "confidence": confidence,
        "per_item": [
            {"id": r["id"], "recall": r["recall"], "failing": bool(r["violations"]) or (r["recall"] or 0) < 1.0}
            for r in rows
        ],
    }
    summary_path = out_path.with_suffix(".summary.json")
    summary_path.write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
    report_path = out_path.with_suffix(".md")
    write_report(report_path, summary, previous_summary(args.split, args.prompt, args.confidence, summary_path))
    print(f"results: {out_path}")
    print(f"report:  {report_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
