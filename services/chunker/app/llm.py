"""LLM access behind a minimal interface so models are swappable per run."""

import os
from typing import Protocol, TypeVar

import anthropic
import openai
from pydantic import BaseModel

DEFAULT_MODEL = "claude-sonnet-5"
# Chosen by the 003 spike: ties gpt-5.5 on the poison set (13/13 caught,
# 6/6 controls), agrees less with unexpected chunks, and is ~2x faster.
DEFAULT_VERIFIER_MODEL = "gpt-5.4-mini"
DEFAULT_EFFORT = "medium"
MAX_TOKENS = 8192

T = TypeVar("T", bound=BaseModel)


class LLMError(Exception):
    """Upstream LLM failure after SDK retries. Maps to HTTP 502."""


class LLMRateLimited(Exception):
    """Upstream rate limit after SDK retries. Maps to HTTP 503."""


class LLMClient(Protocol):
    model: str

    def generate_structured(self, system: str, user: str, output_model: type[T]) -> T: ...


class AnthropicLLMClient:
    def __init__(self, model: str | None = None, effort: str | None = None) -> None:
        self.model = model or os.environ.get("CHUNKER_PRIMARY_MODEL", DEFAULT_MODEL)
        self.effort = effort or os.environ.get("CHUNKER_EFFORT", DEFAULT_EFFORT)
        self._client = anthropic.Anthropic()

    def generate_structured(self, system: str, user: str, output_model: type[T]) -> T:
        # Claude Sonnet 5 rejects non-default sampling params; depth is
        # controlled via effort and structure via output_format.
        try:
            response = self._client.messages.parse(
                model=self.model,
                max_tokens=MAX_TOKENS,
                system=system,
                messages=[{"role": "user", "content": user}],
                output_format=output_model,
                output_config={"effort": self.effort},
            )
        except anthropic.RateLimitError as exc:
            raise LLMRateLimited(str(exc)) from exc
        except (anthropic.APIStatusError, anthropic.APIConnectionError) as exc:
            raise LLMError(str(exc)) from exc
        if response.parsed_output is None:
            raise LLMError(
                f"model returned unparseable output (stop_reason={response.stop_reason})"
            )
        return response.parsed_output


class OpenAILLMClient:
    """Verifier client (003). A different vendor from the Claude primary so
    verifier errors are less correlated with generation errors."""

    def __init__(self, model: str | None = None) -> None:
        self.model = model or os.environ.get("CHUNKER_VERIFIER_MODEL", DEFAULT_VERIFIER_MODEL)
        self._client = openai.OpenAI()

    def generate_structured(self, system: str, user: str, output_model: type[T]) -> T:
        # No sampling params: several current OpenAI models reject them, and
        # the verifier answers narrow yes/no/unsure claims.
        try:
            response = self._client.responses.parse(
                model=self.model,
                instructions=system,
                input=user,
                text_format=output_model,
            )
        except openai.RateLimitError as exc:
            raise LLMRateLimited(str(exc)) from exc
        except (openai.APIStatusError, openai.APIConnectionError) as exc:
            raise LLMError(str(exc)) from exc
        parsed = response.output_parsed
        if parsed is None:
            raise LLMError(f"verifier returned unparseable output (status={response.status})")
        return parsed
