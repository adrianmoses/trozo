import pytest
from fastapi.testclient import TestClient
from pydantic import BaseModel

from app.llm import LLMError
from app.main import app
from app.models import (
    Conjugation,
    DraftAlternative,
    DraftChunk,
    DraftExample,
    DraftNote,
    LLMDraft,
    NoteKind,
    Region,
)


class FakeLLMClient:
    """Returns queued drafts in order; raises queued exceptions."""

    model = "fake-model"

    def __init__(self, responses: list[LLMDraft | Exception] | None = None) -> None:
        self.responses = list(responses or [])
        self.calls: list[tuple[str, str]] = []

    def generate_structured(self, system: str, user: str, output_model: type[BaseModel]):
        self.calls.append((system, user))
        if not self.responses:
            raise LLMError("fake: no responses queued")
        item = self.responses.pop(0)
        if isinstance(item, Exception):
            raise item
        return item


def make_draft() -> LLMDraft:
    """A draft that passes validation: chunk appears in example and translation."""
    return LLMDraft(
        translation="Tengo muchas ganas de ir a la playa.",
        chunks=[
            DraftChunk(
                pattern="tener (muchas) ganas de",
                slots=["+ inf."],
                surface="tener muchas ganas de",
                gloss_en="to be really looking forward to (doing something)",
                regions=[Region.neutral],
                example=DraftExample(
                    es="Tengo muchas ganas de ir a la playa.",
                    en="I'm really looking forward to going to the beach.",
                    conjugation=Conjugation(verb="tener", person="1sg", tense="presente"),
                ),
                alternatives=[
                    DraftAlternative(
                        surface="me hace mucha ilusión + inf.",
                        example_es="Me hace mucha ilusión ir a la playa.",
                        regions=[Region.ES],
                    )
                ],
            )
        ],
        notes=[
            DraftNote(
                kind=NoteKind.false_friend,
                avoid="Estoy muy excitado",
                why="'Excitado' usually reads as sexually aroused.",
                chunk_indexes=[0],
            )
        ],
    )


class FakeVerifier:
    """Answers every claim id with a fixed answer (or per-id overrides)."""

    model = "fake-verifier"

    def __init__(self, default: str = "yes", overrides: dict[str, str] | None = None,
                 error: Exception | None = None) -> None:
        self.default = default
        self.overrides = overrides or {}
        self.error = error
        self.calls: list[str] = []

    def generate_structured(self, system: str, user: str, output_model: type[BaseModel]):
        import re

        from app.pipeline.full import VerifierAnswer, VerifierAnswers

        self.calls.append(user)
        if self.error:
            raise self.error
        ids = re.findall(r"^\[([^\]]+)\]", user, flags=re.M)
        return VerifierAnswers(
            answers=[
                VerifierAnswer(id=i, answer=self.overrides.get(i, self.default), reason="r")
                for i in ids
            ]
        )


@pytest.fixture
def fake_llm() -> FakeLLMClient:
    return FakeLLMClient()


@pytest.fixture
def client(fake_llm: FakeLLMClient, tmp_path, monkeypatch) -> TestClient:
    monkeypatch.setenv("CHUNKER_CACHE_DIR", str(tmp_path / "cache"))
    monkeypatch.setenv("CHUNKER_SEED_PATH", str(tmp_path / "no-seed.yaml"))
    from app.pipeline.seed import load_seed_index

    load_seed_index.cache_clear()
    monkeypatch.delenv("CHUNKER_TOKEN", raising=False)
    monkeypatch.delenv("CHUNKER_SAMPLE_PERTURB", raising=False)
    app.state.llm = fake_llm
    app.state.verifier = None  # no verifier unless a test installs one
    yield TestClient(app)
    app.state.llm = None
    del app.state.verifier
    load_seed_index.cache_clear()
