from app.models import DraftAlternative, DraftChunk, DraftExample, LLMDraft, Region
from app.pipeline.full import (
    build_claims,
    consistency,
    full_confidence,
    map_answer,
    sample_keys,
    sample_prompt,
)
from app.pipeline.spanish import lemma_key
from app.prompts import load_prompt


def _draft(*surfaces: str, alts: tuple[str, ...] = ()) -> LLMDraft:
    chunks = [
        DraftChunk(
            pattern=s,
            surface=s,
            gloss_en="g",
            regions=[Region.neutral],
            example=DraftExample(es=s, en="x"),
            alternatives=[
                DraftAlternative(surface=a, example_es=a, regions=[Region.ES]) for a in alts
            ]
            if i == 0
            else [],
        )
        for i, s in enumerate(surfaces)
    ]
    return LLMDraft(translation=" ".join(surfaces), chunks=chunks)


def test_sample_keys_include_chunks_and_alternatives() -> None:
    keys = sample_keys(_draft("tener ganas de", alts=("me hace ilusión + inf.",)))
    assert lemma_key("tener ganas de") in keys
    assert lemma_key("me hace ilusión") in keys


def test_consistency_shares_and_optional_words() -> None:
    hit = [lemma_key("tener muchas ganas de")]
    miss = [lemma_key("estar emocionado")]
    target = "tener (muchas) ganas de"
    assert consistency(target, [hit] * 5) == 1.0
    assert consistency(target, [hit, hit, hit, miss, miss]) == 0.6
    assert consistency(target, [miss] * 5) == 0.0


def test_consistency_is_null_below_three_samples() -> None:
    hit = [lemma_key("tener ganas de")]
    assert consistency("tener ganas de", [hit, hit]) is None
    assert consistency("tener ganas de", [hit, hit, hit]) == 1.0


def test_full_confidence_rule_order() -> None:
    t = {"t_high": 0.8, "t_med": 0.6}
    assert full_confidence(True, 0.0, "disagree", **t) == "high"  # seed wins
    assert full_confidence(False, 0.8, "agree", **t) == "high"  # boundary inclusive
    assert full_confidence(False, 0.79, "agree", **t) == "med"
    assert full_confidence(False, 1.0, "unsure", **t) == "med"
    assert full_confidence(False, 0.6, None, **t) == "med"
    assert full_confidence(False, 0.2, "agree", **t) == "med"
    assert full_confidence(False, 0.59, "disagree", **t) == "low"
    assert full_confidence(False, None, "disagree", **t) == "low"
    assert full_confidence(False, None, None, **t) == "unrated"


def test_tuned_defaults_require_unanimous_samples_for_high() -> None:
    assert full_confidence(False, 1.0, "agree") == "high"
    assert full_confidence(False, 0.8, "agree") == "med"
    assert full_confidence(False, 0.6, "disagree") == "med"
    assert full_confidence(False, 0.4, "disagree") == "low"


def test_map_answer() -> None:
    assert map_answer("yes") == "agree"
    assert map_answer("no") == "disagree"
    assert map_answer("unsure") == "unsure"
    assert map_answer(None) is None


def test_build_claims_for_chunks_and_alternatives() -> None:
    payload = {
        "chunks": [
            {
                "id": "ch_1",
                "pattern": "echar de menos",
                "slots": ["+ a alguien"],
                "gloss_en": "to miss (someone)",
                "regions": ["ES"],
                "alternatives": [{"surface": "extrañar", "regions": ["neutral"]}],
            }
        ]
    }
    claims = build_claims(payload)
    assert [c.id for c in claims] == ["ch_1", "ch_1.alt_0"]
    assert claims[0].text == (
        '"echar de menos + a alguien" is commonly used in Spain to mean "to miss (someone)".'
    )
    assert "across most of the Spanish-speaking world" in claims[1].text


def test_sample_prompt_identity_and_perturbation() -> None:
    base = load_prompt("p1")
    assert sample_prompt(base, 0, perturb=False) == base
    perturbed = [sample_prompt(base, i, perturb=True) for i in range(5)]
    assert all(p != base for p in perturbed)
    assert len(set(perturbed)) == 5
    head = base.split("## Examples\n")[0]
    for p in perturbed:
        assert p.startswith(head)
        assert sorted(p.split("## Examples\n")[1].split("\n\nInput (")) != []
        assert p.count('Input (preferred_region') == base.count('Input (preferred_region')
