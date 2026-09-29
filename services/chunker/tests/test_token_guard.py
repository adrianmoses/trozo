"""Token guard on Fly (007): without CHUNKER_TOKEN the chunk endpoint fails
closed when FLY_APP_NAME is set, and stays open off Fly."""

from tests.conftest import make_draft


def post(client, headers=None):
    return client.post(
        "/v1/chunk",
        json={"text": "I'm really excited to go to the beach", "preferred_region": "MX"},
        headers=headers or {},
    )


def test_on_fly_without_token_refuses_chunk(client, fake_llm, monkeypatch) -> None:
    monkeypatch.setenv("FLY_APP_NAME", "trozo-chunker")
    fake_llm.responses = [make_draft()]
    resp = post(client)
    assert resp.status_code == 503
    error = resp.json()["error"]
    assert error["code"] == "service_misconfigured"
    assert "CHUNKER_TOKEN" in error["message"]
    assert fake_llm.calls == []  # refused before any LLM call


def test_on_fly_without_token_keeps_health_and_meta_open(client, monkeypatch) -> None:
    monkeypatch.setenv("FLY_APP_NAME", "trozo-chunker")
    assert client.get("/v1/health").status_code == 200
    assert client.get("/v1/meta").status_code == 200


def test_on_fly_with_token_requires_it(client, fake_llm, monkeypatch) -> None:
    monkeypatch.setenv("FLY_APP_NAME", "trozo-chunker")
    monkeypatch.setenv("CHUNKER_TOKEN", "s3cret")
    fake_llm.responses = [make_draft()]
    assert post(client).status_code == 401
    assert post(client, {"Authorization": "Bearer wrong"}).status_code == 401
    assert post(client, {"Authorization": "Bearer s3cret"}).status_code == 200


def test_off_fly_without_token_stays_open(client, fake_llm) -> None:
    fake_llm.responses = [make_draft()]
    assert post(client).status_code == 200
