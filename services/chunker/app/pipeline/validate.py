"""Validate and repair the LLM draft. Pure: returns (repaired, errors).

Errors describe what was dropped or fixed; the route appends them to a
retry prompt when the repaired draft ends up unusable.
"""

from app.models import DraftChunk, LLMDraft, NoteKind, Region
from app.pipeline.spanish import contains_chunk, lemma_key

MAX_CHUNKS = 5
MAX_ALTERNATIVES = 4


def validate_repair(draft: LLMDraft) -> tuple[LLMDraft, list[str]]:
    errors: list[str] = []
    kept: list[DraftChunk] = []
    seen_keys: set[str] = set()

    for chunk in draft.chunks:
        key = lemma_key(chunk.surface)
        if not key:
            errors.append(f"chunk {chunk.surface!r}: empty after normalization; dropped")
            continue
        if key in seen_keys:
            errors.append(f"chunk {chunk.surface!r}: duplicate after normalization; dropped")
            continue
        if not contains_chunk(chunk.example.es, chunk.surface):
            errors.append(
                f"chunk {chunk.surface!r}: example {chunk.example.es!r} does not "
                "contain the chunk (lemma-level); dropped"
            )
            continue
        if not contains_chunk(draft.translation, chunk.surface):
            errors.append(
                f"chunk {chunk.surface!r}: not found in translation "
                f"{draft.translation!r} (lemma-level); dropped"
            )
            continue
        repaired = chunk
        if not chunk.regions:
            repaired = repaired.model_copy(update={"regions": [Region.neutral]})
            errors.append(f"chunk {chunk.surface!r}: empty regions; defaulted to neutral")
        if len(chunk.alternatives) > MAX_ALTERNATIVES:
            repaired = repaired.model_copy(
                update={"alternatives": chunk.alternatives[:MAX_ALTERNATIVES]}
            )
            errors.append(
                f"chunk {chunk.surface!r}: more than {MAX_ALTERNATIVES} alternatives; truncated"
            )
        seen_keys.add(key)
        kept.append(repaired)

    if len(kept) > MAX_CHUNKS:
        errors.append(f"more than {MAX_CHUNKS} chunks; truncated")
        kept = kept[:MAX_CHUNKS]

    notes = []
    for note in draft.notes:
        if note.kind in (NoteKind.calque, NoteKind.false_friend):
            avoid_key = lemma_key(note.avoid)
            if avoid_key and avoid_key in seen_keys:
                errors.append(
                    f"note avoid {note.avoid!r} is identical to a returned chunk; dropped"
                )
                continue
        notes.append(note)

    return draft.model_copy(update={"chunks": kept, "notes": notes}), errors
