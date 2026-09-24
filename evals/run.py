"""trozo eval runner.

Calls the running chunk service over HTTP for each seed item and reports
chunk recall and calque rate. Writes raw results as JSONL.

    uv run run.py --prompt p1 --model primary --split dev
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


def main() -> int:
    parser = argparse.ArgumentParser(description="trozo eval runner")
    parser.add_argument("--prompt", default="p1")
    parser.add_argument("--model", default="primary")
    parser.add_argument("--split", default="dev", choices=["dev", "test", "all"])
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument("--region", default="neutral")
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
    if meta.get("prompt_version") != args.prompt:
        print(
            f"warning: service prompt_version={meta.get('prompt_version')} "
            f"!= requested {args.prompt}",
            file=sys.stderr,
        )

    RESULTS_DIR.mkdir(exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out_path = RESULTS_DIR / f"{stamp}-{args.prompt}-{args.split}.jsonl"

    rows = []
    with out_path.open("w", encoding="utf-8") as out:
        for item in items:
            resp = client.post(
                "/v1/chunk",
                json={"text": item["input"], "preferred_region": args.region},
            )
            if resp.status_code != 200:
                record = {"id": item["id"], "error": resp.json(), "status": resp.status_code}
                rows.append({"id": item["id"], "tier": item["tier"], "recall": None,
                             "violations": ["<request failed>"], "cached": False})
            else:
                body = resp.json()
                scores = score_item(item, body)
                record = {"id": item["id"], "tier": item["tier"], "split": item.get("split"),
                          "scores": scores, "response": body}
                rows.append({
                    "id": item["id"],
                    "tier": item["tier"],
                    "recall": scores["recall"],
                    "violations": scores["calque_violations"],
                    "cached": body["meta"]["cached"],
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
    print(f"results: {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
