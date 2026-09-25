
from app.llm import LLMError
from app.main import app
from app.models import DraftChunk, DraftExample, LLMDraft, Region
from tests.conftest import FakeVerifier, make_draft

BODY = {"text": "I'm really excited to go to the beach", "preferred_region": "MX"}


def full(client):
    return client.post("/v1/chunk", json={**BODY, "confidence_mode": "full"})


def other_draft() -> LLMDraft:
    """A sample that does not contain the main chunk or its alternative."""
    return LLMDraft(
        translation="Estoy emocionado por ir a la playa.",
        chunks=[
            DraftChunk(
                pattern="estar emocionado por",
                surface="estar emocionado por",
                gloss_en="to be excited about",
                regions=[Region.neutral],
                example=DraftExample(es="Estoy emocionado por ir a la playa.", en="x"),
            )
        ],
    )


def test_full_keeps_the_fast_draft_and_adds_signals(client, fake_llm) -> None:
    fake_llm.responses = [make_draft()]
    fast = client.post("/v1/chunk", json=BODY).json()

    fake_llm.responses = [make_draft()] * 5
    app.state.verifier = FakeVerifier("yes")
    body = full(client).json()

    assert [c["id"] for c in body["chunks"]] == [c["id"] for c in fast["chunks"]]
    assert body["translation"] == fast["translation"]
    assert body["chunks"][0]["surface"] == fast["chunks"][0]["surface"]
    assert body["chunks"][0]["example"] == fast["chunks"][0]["example"]
    chunk = body["chunks"][0]
    assert chunk["confidence"]["signals"] == {"seed": False, "consistency": 1.0, "verifier": "agree"}
    assert chunk["confidence"]["label"] == "high"
    alt = chunk["alternatives"][0]
    assert alt["confidence"]["signals"]["consistency"] == 1.0
    assert alt["confidence"]["label"] == "high"
    assert len(fake_llm.calls) == 6  # 1 fast + 5 samples


def test_full_on_a_cold_cache_generates_the_draft_first(client, fake_llm) -> None:
    fake_llm.responses = [make_draft()] * 6
    app.state.verifier = FakeVerifier("yes")
    body = full(client).json()
    assert body["chunks"][0]["confidence"]["label"] == "high"
    assert len(fake_llm.calls) == 6


def test_labels_follow_signals(client, fake_llm) -> None:
    fake_llm.responses = [make_draft()] + [make_draft()] * 2 + [other_draft()] * 3
    app.state.verifier = FakeVerifier("no", overrides={"ch_1.alt_0": "yes"})
    chunk = full(client).json()["chunks"][0]
    assert chunk["confidence"]["signals"]["consistency"] == 0.4
    assert chunk["confidence"]["signals"]["verifier"] == "disagree"
    assert chunk["confidence"]["label"] == "low"
    assert chunk["alternatives"][0]["confidence"]["label"] == "med"  # 0.4 but verifier agrees


def test_repeat_full_is_cached_and_fast_entry_unchanged(client, fake_llm) -> None:
    fake_llm.responses = [make_draft()] * 6
    verifier = FakeVerifier("yes")
    app.state.verifier = verifier
    first = full(client).json()
    assert first["meta"]["cached"] is False

    second = full(client).json()
    assert second["meta"]["cached"] is True
    assert len(fake_llm.calls) == 6
    assert len(verifier.calls) == 1
    assert second["chunks"] == first["chunks"]

    fast = client.post("/v1/chunk", json=BODY).json()
    assert fast["chunks"][0]["confidence"]["label"] == "unrated"
    assert fast["chunks"][0]["confidence"]["signals"]["consistency"] is None


def test_no_verifier_means_consistency_only(client, fake_llm) -> None:
    fake_llm.responses = [make_draft()] * 6
    chunk = full(client).json()["chunks"][0]
    assert chunk["confidence"]["signals"]["verifier"] is None
    assert chunk["confidence"]["signals"]["consistency"] == 1.0
    assert chunk["confidence"]["label"] == "med"  # high needs verifier agreement


def test_verifier_failure_degrades_without_error(client, fake_llm) -> None:
    fake_llm.responses = [make_draft()] * 6
    app.state.verifier = FakeVerifier(error=LLMError("openai down"))
    resp = full(client)
    assert resp.status_code == 200
    chunk = resp.json()["chunks"][0]
    assert chunk["confidence"]["signals"]["verifier"] is None
    assert chunk["confidence"]["label"] == "med"


def test_too_few_samples_and_no_verifier_stays_unrated(client, fake_llm) -> None:
    fake_llm.responses = [make_draft(), make_draft(), make_draft()]  # fast + 2 samples, 3 fail
    resp = full(client)
    assert resp.status_code == 200
    chunk = resp.json()["chunks"][0]
    assert chunk["confidence"]["signals"]["consistency"] is None
    assert chunk["confidence"]["label"] == "unrated"


def test_seed_verified_labels_never_change(client, fake_llm, tmp_path, monkeypatch) -> None:
    seed = tmp_path / "seed.yaml"
    seed.write_text(
        "- id: s\n  expected_chunks:\n    - surface: tener muchas ganas de\n      regions: [neutral]\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("CHUNKER_SEED_PATH", str(seed))
    from app.pipeline.seed import load_seed_index

    load_seed_index.cache_clear()
    fake_llm.responses = [make_draft()] + [other_draft()] * 5
    app.state.verifier = FakeVerifier("no")
    chunk = full(client).json()["chunks"][0]
    assert chunk["confidence"]["label"] == "high"
    assert chunk["confidence"]["signals"]["seed"] is True


def test_meta_reports_verifier_and_thresholds(client) -> None:
    body = client.get("/v1/meta").json()
    assert body["verifier_model"] is None
    app.state.verifier = FakeVerifier()
    body = client.get("/v1/meta").json()
    assert body["verifier_model"] == "fake-verifier"
    assert body["full_confidence"]["samples"] == 5


def test_cached_full_entries_are_relabelled_with_current_thresholds(client, fake_llm, monkeypatch) -> None:
    import app.pipeline.full as full_module

    fake_llm.responses = [make_draft()] + [make_draft()] * 4 + [other_draft()]
    app.state.verifier = FakeVerifier("yes")
    first = full(client).json()["chunks"][0]
    assert first["confidence"]["signals"]["consistency"] == 0.8
    assert first["confidence"]["label"] == "med"  # T_HIGH = 1.0

    monkeypatch.setattr(full_module, "T_HIGH", 0.8)
    monkeypatch.setattr(full_module.relabel, "__defaults__", (0.8, full_module.T_MED))
    again = full(client).json()
    assert again["meta"]["cached"] is True
    assert again["chunks"][0]["confidence"]["label"] == "high"
    assert len(fake_llm.calls) == 6
