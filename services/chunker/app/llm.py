"""LLM access behind a minimal interface so models are swappable per run."""

import os
from typing import Protocol, TypeVar

import anthropic
from pydantic import BaseModel

DEFAULT_MODEL = "claude-sonnet-5"
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
