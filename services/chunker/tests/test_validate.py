from app.models import DraftAlternative, DraftChunk, DraftExample, DraftNote, LLMDraft, NoteKind, Region
from app.pipeline.validate import validate_repair
from tests.conftest import make_draft


def chunk_with(surface: str, example_es: str, **overrides) -> DraftChunk:
    fields = dict(
        pattern=surface,
        slots=[],
        surface=surface,
        gloss_en="gloss",
        regions=[Region.neutral],
        example=DraftExample(es=example_es, en="en"),
        alternatives=[],
    )
    fields.update(overrides)
    return DraftChunk(**fields)


def test_valid_draft_passes_unchanged() -> None:
    repaired, errors = validate_repair(make_draft())
    assert len(repaired.chunks) == 1
    assert errors == []


def test_chunk_missing_from_example_dropped() -> None:
    draft = LLMDraft(
        translation="Tengo ganas de ir.",
        chunks=[chunk_with("tener ganas de", "Vamos a la playa.")],
    )
    repaired, errors = validate_repair(draft)
    assert repaired.chunks == []
    assert any("does not contain the chunk" in e for e in errors)


def test_chunk_missing_from_translation_dropped() -> None:
    draft = LLMDraft(
        translation="Vamos a la playa.",
        chunks=[chunk_with("tener ganas de", "Tengo ganas de ir.")],
    )
    repaired, errors = validate_repair(draft)
    assert repaired.chunks == []
    assert any("not found in translation" in e for e in errors)


def test_duplicate_chunks_deduped() -> None:
    draft = LLMDraft(
        translation="Tengo ganas de ir.",
        chunks=[
            chunk_with("tener ganas de", "Tengo ganas de ir."),
            chunk_with("tengo ganas de", "Tengo ganas de ir."),
        ],
    )
    repaired, errors = validate_repair(draft)
    assert len(repaired.chunks) == 1
    assert any("duplicate" in e for e in errors)


def test_excess_alternatives_truncated() -> None:
    alts = [
        DraftAlternative(surface=f"alt {i}", example_es="x", regions=[Region.ES])
        for i in range(6)
    ]
    draft = LLMDraft(
        translation="Tengo ganas de ir.",
        chunks=[chunk_with("tener ganas de", "Tengo ganas de ir.", alternatives=alts)],
    )
    repaired, errors = validate_repair(draft)
    assert len(repaired.chunks[0].alternatives) == 4
    assert any("alternatives" in e for e in errors)


def test_empty_regions_defaulted() -> None:
    draft = LLMDraft(
        translation="Tengo ganas de ir.",
        chunks=[chunk_with("tener ganas de", "Tengo ganas de ir.", regions=[])],
    )
    repaired, _ = validate_repair(draft)
    assert repaired.chunks[0].regions == [Region.neutral]


def test_calque_avoid_identical_to_chunk_dropped() -> None:
    draft = LLMDraft(
        translation="Tengo ganas de ir.",
        chunks=[chunk_with("tener ganas de", "Tengo ganas de ir.")],
        notes=[
            DraftNote(kind=NoteKind.calque, avoid="tengo ganas de", why="w"),
            DraftNote(kind=NoteKind.register, avoid="el weekend", why="w"),
        ],
    )
    repaired, errors = validate_repair(draft)
    assert len(repaired.notes) == 1
    assert repaired.notes[0].avoid == "el weekend"
    assert any("identical to a returned chunk" in e for e in errors)
