"""Shape and hygiene of the seed set (feature 005)."""

import re
from collections import Counter
from pathlib import Path

import pytest
import yaml

from run import SEED_PATH, norm_tokens

REGIONS = {"neutral", "ES", "MX", "AR", "CO"}
TIERS = {"simple": 36, "regional": 36, "advanced": 30, "calque": 18}
REQUIRED = ("id", "tier", "split", "input", "expected_chunks", "forbidden", "source", "checked")
CHECK = re.compile(r"^(native:(ES|MX|AR|CO)|reference:\S.*|author)$")
PROMPTS = Path(__file__).resolve().parents[2] / "services" / "chunker" / "prompts"
FINAL_SIZE = 110  # final-shape checks switch on once the seed is grown

ITEMS = yaml.safe_load(SEED_PATH.read_text(encoding="utf-8"))


def forms(item):
    for exp in [*item["expected_chunks"], *(item.get("also_valid") or [])]:
        yield exp["surface"], exp.get("regions")
        for alt in exp.get("accepted") or []:
            if isinstance(alt, str):
                yield alt, exp.get("regions")
            else:
                yield alt["surface"], alt.get("regions") or exp.get("regions")


def test_required_fields_and_values():
    for item in ITEMS:
        missing = [k for k in REQUIRED if k not in item]
        assert not missing, (item.get("id"), missing)
        assert item["tier"] in TIERS, item["id"]
        assert item["split"] in {"dev", "test"}, item["id"]
        assert item["expected_chunks"], item["id"]
        assert all(CHECK.match(str(c)) for c in item["checked"]), (item["id"], item["checked"])


def test_regions_are_the_launch_set():
    for item in ITEMS:
        for surface, regions in forms(item):
            assert regions and set(regions) <= REGIONS, (item["id"], surface, regions)


def test_ids_and_inputs_are_unique():
    ids = Counter(i["id"] for i in ITEMS)
    assert not [k for k, n in ids.items() if n > 1]
    inputs = Counter(" ".join(norm_tokens(i["input"])) for i in ITEMS)
    assert not [k for k, n in inputs.items() if n > 1]


def test_few_shot_inputs_are_in_dev():
    """Items whose input appears as a few-shot example in any prompt must be
    dev: test items must be unseen by the prompt."""
    shots = set()
    for prompt in PROMPTS.glob("p*.md"):
        shots |= {" ".join(norm_tokens(m)) for m in re.findall(r'^Input \([^)]*\): "(.*)"$', prompt.read_text(), re.M)}
    assert shots
    for item in ITEMS:
        if " ".join(norm_tokens(item["input"])) in shots:
            assert item["split"] == "dev", item["id"]


@pytest.mark.skipif(len(ITEMS) < FINAL_SIZE, reason=f"seed not grown yet ({len(ITEMS)} < {FINAL_SIZE} items)")
def test_final_shape_tiers_splits_and_checks():
    tiers = Counter(i["tier"] for i in ITEMS)
    for tier, target in TIERS.items():
        assert abs(tiers[tier] - target) <= 3, (tier, tiers[tier], target)
        dev = sum(1 for i in ITEMS if i["tier"] == tier and i["split"] == "dev")
        assert abs(dev - (tiers[tier] - dev)) <= 2, (tier, dev, tiers[tier] - dev)
    unchecked = [i["id"] for i in ITEMS if not i["checked"]]
    assert not unchecked, unchecked


def test_there_are_neutral_only_forms_for_over_tagging():
    neutral_only = [s for i in ITEMS if i["tier"] == "regional" for s, r in forms(i) if r == ["neutral"]]
    assert neutral_only


def test_note_kinds_are_the_service_enum():
    import json

    schema = Path(__file__).resolve().parents[2] / "packages" / "schema" / "chunk.schema.json"
    kinds = set(json.loads(schema.read_text(encoding="utf-8"))["$defs"]["NoteKind"]["enum"])
    for item in ITEMS:
        assert set(item.get("expected_note_kinds") or []) <= kinds, item["id"]
