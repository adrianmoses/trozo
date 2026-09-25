from tests.conftest import make_draft


def post(client, headers=None):
    return client.post(
        "/v1/chunk",
        json={"text": "I'm really excited to go to the beach", "preferred_region": "MX"},
        headers=headers or {},
    )


def test_open_when_token_unset(client, fake_llm, monkeypatch) -> None:
    monkeypatch.delenv("CHUNKER_TOKEN", raising=False)
    fake_llm.responses = [make_draft()]
    assert post(client).status_code == 200


def test_matching_bearer_token_accepted(client, fake_llm, monkeypatch) -> None:
    monkeypatch.setenv("CHUNKER_TOKEN", "s3cret")
    fake_llm.responses = [make_draft()]
    assert post(client, {"Authorization": "Bearer s3cret"}).status_code == 200


def test_missing_token_rejected(client, fake_llm, monkeypatch) -> None:
    monkeypatch.setenv("CHUNKER_TOKEN", "s3cret")
    fake_llm.responses = [make_draft()]
    resp = post(client)
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "unauthorized"
    assert fake_llm.calls == []


def test_wrong_token_rejected(client, fake_llm, monkeypatch) -> None:
    monkeypatch.setenv("CHUNKER_TOKEN", "s3cret")
    fake_llm.responses = [make_draft()]
    assert post(client, {"Authorization": "Bearer nope"}).status_code == 401
    assert post(client, {"Authorization": "Basic s3cret"}).status_code == 401


def test_health_and_meta_stay_open(client, monkeypatch) -> None:
    monkeypatch.setenv("CHUNKER_TOKEN", "s3cret")
    assert client.get("/v1/health").status_code == 200
    assert client.get("/v1/meta").status_code == 200
