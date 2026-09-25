import openai
import pytest

from app.llm import LLMError, LLMRateLimited, OpenAILLMClient
from app.pipeline.full import VerifierAnswers


class _Resp:
    def __init__(self, parsed, status="completed"):
        self.output_parsed = parsed
        self.status = status


def _client(monkeypatch, behaviour):
    monkeypatch.setenv("OPENAI_API_KEY", "test")
    c = OpenAILLMClient("gpt-test")

    def parse(**kwargs):
        return behaviour(kwargs)

    monkeypatch.setattr(c._client.responses, "parse", parse)
    return c


def test_returns_parsed_output_and_passes_model(monkeypatch) -> None:
    seen = {}
    parsed = VerifierAnswers(answers=[])

    def ok(kwargs):
        seen.update(kwargs)
        return _Resp(parsed)

    c = _client(monkeypatch, ok)
    assert c.generate_structured("sys", "user", VerifierAnswers) is parsed
    assert seen["model"] == "gpt-test"
    assert seen["instructions"] == "sys"
    assert seen["input"] == "user"
    assert seen["text_format"] is VerifierAnswers
    assert "temperature" not in seen


def test_unparseable_output_raises_llm_error(monkeypatch) -> None:
    c = _client(monkeypatch, lambda kwargs: _Resp(None, status="incomplete"))
    with pytest.raises(LLMError, match="incomplete"):
        c.generate_structured("s", "u", VerifierAnswers)


def test_rate_limit_and_connection_errors_are_mapped(monkeypatch) -> None:
    import httpx

    req = httpx.Request("POST", "https://api.openai.com/v1/responses")

    def rate_limited(kwargs):
        raise openai.RateLimitError("slow down", response=httpx.Response(429, request=req), body=None)

    def down(kwargs):
        raise openai.APIConnectionError(request=req)

    with pytest.raises(LLMRateLimited):
        _client(monkeypatch, rate_limited).generate_structured("s", "u", VerifierAnswers)
    with pytest.raises(LLMError):
        _client(monkeypatch, down).generate_structured("s", "u", VerifierAnswers)
