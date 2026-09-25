from app.llm import LLMError
from app.models import LLMDraft
from tests.conftest import make_draft


def post(client, text="I'm really excited to go to the beach"):
    return client.post("/v1/chunk", json={"text": text, "preferred_region": "MX"})


def test_happy_path(client, fake_llm) -> None:
    fake_llm.responses = [make_draft()]
    resp = post(client)
    assert resp.status_code == 200
    body = resp.json()
    assert body["translation"] == "Tengo muchas ganas de ir a la playa."
    chunk = body["chunks"][0]
    assert chunk["id"] == "ch_1"
    assert chunk["confidence"]["label"] == "unrated"  # no seed file in tests
    assert chunk["example"]["highlight"] is not None
    # "Tengo muchas ganas de" inside the translation, lemma-level match on "tener".
    assert chunk["translation_highlight"] == [0, 21]
    assert chunk["alternatives"][0]["confidence"]["label"] == "unrated"
    assert body["notes"][0]["applies_to"] == ["ch_1"]
    meta = body["meta"]
    assert meta["model"] == "fake-model"
    assert meta["prompt_version"] == "p1"
    assert meta["cached"] is False
    assert body["request_id"].startswith("req_")


def test_cache_hit_skips_llm(client, fake_llm) -> None:
    fake_llm.responses = [make_draft()]
    assert post(client).status_code == 200
    resp = post(client)
    assert resp.status_code == 200
    assert resp.json()["meta"]["cached"] is True
    assert len(fake_llm.calls) == 1


def test_empty_input_422(client) -> None:
    resp = post(client, text="   ")
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "invalid_input"


def test_too_long_input_422(client) -> None:
    resp = client.post("/v1/chunk", json={"text": "x" * 300})
    assert resp.status_code == 422


def test_llm_failure_502(client, fake_llm) -> None:
    fake_llm.responses = [LLMError("upstream boom")]
    resp = post(client)
    assert resp.status_code == 502
    assert resp.json()["error"]["code"] == "llm_failure"


def test_retry_on_fully_invalid_draft(client, fake_llm) -> None:
    bad = LLMDraft(
        translation="Vamos a la playa.",
        chunks=[make_draft().chunks[0]],  # chunk not present in this translation
    )
    fake_llm.responses = [bad, make_draft()]
    resp = post(client)
    assert resp.status_code == 200
    assert len(fake_llm.calls) == 2
    assert "problems" in fake_llm.calls[1][1]
    assert len(resp.json()["chunks"]) == 1


def test_meta_endpoint(client) -> None:
    body = client.get("/v1/meta").json()
    assert "ES" in body["regions"]
    assert "calque" in body["note_kinds"]
    assert body["prompt_version"] == "p1"


def test_translation_highlight_null_when_no_match(client, fake_llm, monkeypatch) -> None:
    import app.main as main_module

    monkeypatch.setattr(main_module, "highlight_range", lambda text, surface: None)
    fake_llm.responses = [make_draft()]
    resp = post(client)
    assert resp.status_code == 200
    assert resp.json()["chunks"][0]["translation_highlight"] is None


def test_cached_payload_without_translation_highlight_is_backfilled(client, fake_llm) -> None:
    """Cache hits are served as raw dicts: entries written before the field
    existed have no key at all. The service adds the range on read and
    persists it, without calling the LLM."""
    from app.pipeline import cache
    from app.pipeline.normalize import normalize_input
    from app.prompts import current_version

    text = normalize_input("I'm really excited to go to the beach")
    key = cache.cache_key(text, "MX", current_version(), fake_llm.model)
    fake_llm.responses = [make_draft()]
    first = post(client).json()
    stale = {**first}
    stale["chunks"] = [{k: v for k, v in c.items() if k != "translation_highlight"} for c in first["chunks"]]
    cache.put(key, stale)

    resp = post(client)
    assert resp.status_code == 200
    body = resp.json()
    assert body["meta"]["cached"] is True
    assert body["chunks"][0]["translation_highlight"] == [0, 21]
    assert len(fake_llm.calls) == 1
    # Persisted: the stored entry now carries the field too.
    assert cache.get(key)["chunks"][0]["translation_highlight"] == [0, 21]
