"""Scoring for feature 005: accepted alternatives, region metrics, check mix."""

from confidence_metrics import targets
from region_metrics import check_mix, region_rows, summarise_regions
from run import expected_match, match_regions, score_item


def entry(surface, regions, label="high", **sig):
    return {
        "surface": surface,
        "regions": regions,
        "confidence": {"label": label, "signals": {"seed": False, "consistency": 1.0, "verifier": "agree", **sig}},
    }


def response(*chunks):
    out = []
    for c in chunks:
        c = dict(c)
        c.setdefault("example", {"es": "", "en": ""})
        c.setdefault("alternatives", [])
        out.append(c)
    return {"translation": "", "chunks": out, "notes": [], "meta": {"cached": True, "model": "m"}}


BUS = {
    "id": "bus-01",
    "tier": "regional",
    "expected_chunks": [
        {"surface": "camión", "regions": ["MX"], "accepted": [{"surface": "autobús", "regions": ["neutral", "ES"]}, "pesero"]},
        {"surface": "colectivo", "regions": ["AR"]},
    ],
    "forbidden": [],
}


# --- accepted alternatives ---


def test_expected_match_accepts_primary_and_accepted_forms():
    exp = BUS["expected_chunks"][0]
    assert expected_match("camión", exp)
    assert expected_match("autobús", exp)
    assert not expected_match("guagua", exp)


def test_accepted_alternative_counts_for_recall():
    scores = score_item(BUS, response(entry("autobús", ["neutral"]), entry("colectivo", ["AR"])))
    assert scores["recall"] == 1.0
    assert scores["found"][0]["via"] == "autobús"


def test_without_accepted_the_same_output_is_a_miss():
    item = {**BUS, "expected_chunks": [{"surface": "camión", "regions": ["MX"]}]}
    assert score_item(item, response(entry("autobús", ["neutral"])))["recall"] == 0.0


def test_accepted_alternative_counts_as_correct_for_confidence():
    rows = targets(BUS, response(entry("autobús", ["neutral"])), expected_match)
    assert rows[0]["correct"] is True


# --- region precision ---


def test_region_precision_counts_correct_extra_and_wrong_tags():
    resp = response(
        entry("camión", ["MX"]),  # 1/1 correct
        entry("colectivo", ["AR", "MX"]),  # 1/2: MX is extra
        entry("autobús", ["AR"]),  # 0/1: autobús is accepted with its own regions [neutral, ES]
    )
    s = summarise_regions(region_rows(BUS, resp, match_regions))
    assert s["tags"] == 4
    assert s["region_precision"] == 0.5
    assert s["matched"] == 3 and s["unmatched_excluded"] == 0


def test_unmatched_entries_are_excluded_and_counted():
    resp = response({**entry("camión", ["MX"]), "alternatives": [entry("guagua", ["neutral"])]})
    s = summarise_regions(region_rows(BUS, resp, match_regions))
    assert s["entries"] == 2
    assert s["unmatched_excluded"] == 1
    assert s["region_precision"] == 1.0


def test_missing_regions_default_to_neutral():
    item = {"expected_chunks": [{"surface": "tener hambre", "regions": ["neutral"]}]}
    resp = response({**entry("tener hambre", []), "regions": None})
    rows = region_rows(item, resp, match_regions)
    assert rows[0]["tags"] == ["neutral"]
    assert rows[0]["over_tagged"] is False


# --- over-tagging ---


EXCITED = {
    "expected_chunks": [
        {"surface": "me emociona mucho", "regions": ["neutral"]},
        {"surface": "me hace ilusión", "regions": ["ES"]},
    ]
}


def test_country_tag_on_a_neutral_only_form_is_over_tagging():
    resp = response(entry("me emociona mucho", ["MX"]), entry("me hace ilusión", ["ES"]))
    s = summarise_regions(region_rows(EXCITED, resp, match_regions))
    assert s["neutral_targets"] == 1
    assert s["over_tagged"] == 1
    assert s["over_tag_rate"] == 1.0


def test_neutral_tag_on_a_neutral_only_form_is_not_over_tagging():
    resp = response(entry("me emociona mucho", ["neutral"]), entry("me hace ilusión", ["ES"]))
    s = summarise_regions(region_rows(EXCITED, resp, match_regions))
    assert s["over_tag_rate"] == 0.0


def test_country_tag_on_a_regional_expectation_is_not_an_over_tagging_target():
    resp = response(entry("me hace ilusión", ["ES"]))
    s = summarise_regions(region_rows(EXCITED, resp, match_regions))
    assert s["neutral_targets"] == 0
    assert s["over_tag_rate"] is None


# --- check mix ---


def test_check_mix_counts_methods_per_tier():
    items = [
        {"tier": "regional", "checked": ["native:AR", "reference:DLE"]},
        {"tier": "regional", "checked": ["author"]},
        {"tier": "regional", "checked": []},
        {"tier": "simple"},
    ]
    assert check_mix(items) == {
        "regional": {"items": 3, "native": 1, "reference": 1, "author": 1, "unchecked": 1},
        "simple": {"items": 1, "native": 0, "reference": 0, "author": 0, "unchecked": 1},
    }


def test_accepted_form_is_scored_against_its_own_regions():
    exp = BUS["expected_chunks"][0]
    assert match_regions("autobús", exp) == ["neutral", "ES"]
    # A plain-string accepted form inherits the primary's regions.
    assert match_regions("pesero", exp) == ["MX"]


def test_also_valid_chunk_is_not_required_for_recall_but_counts_as_correct():
    item = {
        "expected_chunks": [{"surface": "llegar tarde", "regions": ["neutral"]}],
        "also_valid": [{"surface": "autobús", "regions": ["neutral", "ES"]}],
        "forbidden": [],
    }
    only_required = response(entry("llegar tarde", ["neutral"]))
    assert score_item(item, only_required)["recall"] == 1.0
    both = response(entry("llegar tarde", ["neutral"]), entry("autobús", ["ES"]))
    assert [t["correct"] for t in targets(item, both, expected_match)] == [True, True]
    s = summarise_regions(region_rows(item, both, match_regions))
    assert s["matched"] == 2 and s["region_precision"] == 1.0
