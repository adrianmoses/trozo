from app.pipeline.spanish import (
    clean_surface,
    contains_chunk,
    highlight_range,
    lemma_key,
    strip_accents,
)


def test_strip_accents() -> None:
    assert strip_accents("ilusión") == "ilusion"
    assert strip_accents("mañana") == "manana"  # matching-only normalization


def test_clean_surface_removes_optionals_and_slots() -> None:
    assert clean_surface("tener (muchas) ganas de") == "tener ganas de"
    assert clean_surface("me hace mucha ilusión + inf.") == "me hace mucha ilusión"


def test_lemma_key_conflates_inflections() -> None:
    assert lemma_key("tengo muchas ganas de") == lemma_key("tener muchas ganas de")


def test_contains_chunk_conjugated() -> None:
    assert contains_chunk("Tengo muchas ganas de ir a la playa.", "tener muchas ganas de")


def test_contains_chunk_with_gap() -> None:
    # optional word present in text but not in the chunk surface
    assert contains_chunk("Tengo muchas ganas de verte.", "tener ganas de")


def test_contains_chunk_negative() -> None:
    assert not contains_chunk("Vamos a la playa.", "tener ganas de")


def test_highlight_range_covers_chunk() -> None:
    text = "Tengo muchas ganas de ir a la playa."
    span = highlight_range(text, "tener muchas ganas de")
    assert span is not None
    start, end = span
    assert text[start:end] == "Tengo muchas ganas de"


def test_highlight_range_none_when_absent() -> None:
    assert highlight_range("Vamos a la playa.", "tener ganas de") is None


def test_contains_chunk_mislemmatized_verb() -> None:
    # spike finding: spaCy reads 'extraño' as the adjective, not extrañar;
    # the verb-stem fallback must still match.
    assert contains_chunk("Te extraño.", "extrañar")


def test_contains_chunk_clitic_verb() -> None:
    assert contains_chunk("Quiero postularme para un trabajo.", "postularse para")


def test_contains_chunk_short_reflexive() -> None:
    # spike finding: 'darse' must strip to 'dar' too, or the phantom 'él'
    # lemma from clitic expansion breaks matching.
    assert contains_chunk("No me di cuenta de que era tan tarde.", "darse cuenta de")


def test_contains_chunk_contraction() -> None:
    # 'al' = a + el must satisfy a chunk ending in 'a'
    assert contains_chunk("Presta atención al maestro.", "prestar atención a")


def test_contains_chunk_object_clitic() -> None:
    assert contains_chunk("Lo pasamos genial.", "pasarlo genial")


def test_keys_overlap_optional_words() -> None:
    from app.pipeline.spanish import keys_overlap, lemma_key

    assert keys_overlap(lemma_key("tener muchas ganas de"), lemma_key("tener ganas de"))
    assert not keys_overlap(lemma_key("tener ganas de"), lemma_key("echar de menos"))
