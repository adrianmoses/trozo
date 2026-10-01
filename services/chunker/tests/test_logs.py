import json

from app.llm import LLMError
from tests.conftest import make_draft

PHRASE = "I'm really excited to go to the beach"


def post(client, text=PHRASE, mode="fast"):
    return client.post(
        "/v1/chunk", json={"text": text, "preferred_region": "MX", "confidence_mode": mode}
    )


def log_lines(capsys) -> list[dict]:
    out = capsys.readouterr().out
    return [json.loads(line) for line in out.splitlines() if line.startswith("{")]


def events(capsys, name: str) -> list[dict]:
    return [line for line in log_lines(capsys) if line.get("event") == name]


def test_chunk_logs_one_line_with_fields(client, fake_llm, capsys) -> None:
    fake_llm.responses = [make_draft()]
    assert post(client).status_code == 200
    (line,) = events(capsys, "chunk")
    assert line["status"] == 200
    assert line["confidence_mode"] == "fast"
    assert line["region"] == "MX"
    assert line["prompt_version"] == "p1"
    assert line["cache_hit"] is False
    assert isinstance(line["latency_ms"], int)
    assert line["chunks"] == 1
    assert line["dropped"] == 0
    assert line["request_id"].startswith("req_")
    assert line["level"] == "info"


def test_cache_hit_logged(client, fake_llm, capsys) -> None:
    fake_llm.responses = [make_draft()]
    post(client)
    post(client)
    assert [line["cache_hit"] for line in events(capsys, "chunk")] == [False, True]


def test_full_mode_logged(client, fake_llm, capsys) -> None:
    fake_llm.responses = [make_draft()] * 6
    assert post(client, mode="full").status_code == 200
    (line,) = events(capsys, "chunk")
    assert line["confidence_mode"] == "full"


def test_input_phrase_never_logged(client, fake_llm, capsys) -> None:
    fake_llm.responses = [make_draft()]
    post(client)
    post(client, text="x" * 300)  # validation error path
    out = capsys.readouterr().out
    assert "excited" not in out
    assert "x" * 50 not in out


def test_error_logged_with_type(client, fake_llm, capsys) -> None:
    fake_llm.responses = [LLMError("upstream boom with secret detail")]
    assert post(client).status_code == 502
    lines = log_lines(capsys)
    (line,) = [entry for entry in lines if entry.get("event") == "chunk_error"]
    assert line == {
        **{k: line[k] for k in ("ts", "logger")},
        "level": "warning",
        "event": "chunk_error",
        "status": 502,
        "code": "llm_failure",
        "exc_type": "LLMError",
    }
    assert not [entry for entry in lines if entry.get("event") == "chunk"]
    assert "secret detail" not in json.dumps(lines)


def test_unauthorized_logged_without_token(client, monkeypatch, capsys) -> None:
    monkeypatch.setenv("CHUNKER_TOKEN", "s3cret-token")
    resp = client.post(
        "/v1/chunk",
        json={"text": PHRASE},
        headers={"authorization": "Bearer wrong-token"},
    )
    assert resp.status_code == 401
    out = capsys.readouterr().out
    (line,) = [json.loads(x) for x in out.splitlines() if '"chunk_error"' in x]
    assert line["status"] == 401
    assert "wrong-token" not in out and "s3cret" not in out


def test_health_not_logged(client, capsys) -> None:
    client.get("/v1/health")
    assert log_lines(capsys) == []
