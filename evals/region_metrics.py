"""Region metrics for the eval harness (feature 005).

Region precision: of the region tags on chunks and alternatives that match an
expected chunk, the share that the matched expectation lists.

Over-tagging: of the matches against expectations tagged only `neutral`
(forms used everywhere), the share that carry a country tag anyway.

Entries that match no expectation cannot be scored for region; they are
excluded and counted, so the report shows how much was left out.
"""

from __future__ import annotations

from collections import Counter

from confidence_metrics import expectations

NEUTRAL = "neutral"


def response_entries(response: dict) -> list[tuple[str, dict]]:
    out = []
    for chunk in response.get("chunks", []):
        out.append(("chunk", chunk))
        out.extend(("alt", alt) for alt in chunk.get("alternatives", []))
    return out


def region_rows(item: dict, response: dict, match_regions) -> list[dict]:
    """One row per chunk and alternative. `match_regions(surface, expected)`
    returns the regions of the expected form the surface matches (primary or
    accepted), or None."""
    expected = expectations(item)
    rows = []
    for kind, entry in response_entries(response):
        tags = entry.get("regions") or [NEUTRAL]
        want_list = next(
            (r for e in expected if (r := match_regions(entry["surface"], e)) is not None), None
        )
        if want_list is None:
            rows.append({"kind": kind, "surface": entry["surface"], "matched": False})
            continue
        want = set(want_list or [NEUTRAL])
        rows.append(
            {
                "kind": kind,
                "surface": entry["surface"],
                "matched": True,
                "tags": list(tags),
                "correct_tags": [t for t in tags if t in want],
                "neutral_target": want == {NEUTRAL},
                "over_tagged": want == {NEUTRAL} and any(t != NEUTRAL for t in tags),
            }
        )
    return rows


def summarise_regions(rows: list[dict]) -> dict:
    matched = [r for r in rows if r["matched"]]
    tags = sum(len(r["tags"]) for r in matched)
    correct = sum(len(r["correct_tags"]) for r in matched)
    targets = [r for r in matched if r["neutral_target"]]
    over = sum(r["over_tagged"] for r in targets)
    return {
        "entries": len(rows),
        "matched": len(matched),
        "unmatched_excluded": len(rows) - len(matched),
        "tags": tags,
        "region_precision": correct / tags if tags else None,
        "neutral_targets": len(targets),
        "over_tagged": over,
        "over_tag_rate": over / len(targets) if targets else None,
    }


def check_methods(item: dict) -> set[str]:
    """`native`, `reference` and/or `author` from an item's `checked` list."""
    return {str(c).split(":", 1)[0] for c in item.get("checked") or []}


def check_mix(items: list[dict]) -> dict[str, dict[str, int]]:
    """Per tier: items with any native check, any reference, the author's own
    review, and none. An item with several methods counts in each."""
    mix: dict[str, Counter] = {}
    for item in items:
        counts = mix.setdefault(item.get("tier", "?"), Counter())
        methods = check_methods(item)
        counts["items"] += 1
        for method in ("native", "reference", "author"):
            counts[method] += method in methods
        counts["unchecked"] += not methods
    return {
        tier: {k: c[k] for k in ("items", "native", "reference", "author", "unchecked")}
        for tier, c in sorted(mix.items())
    }
