"""JSON log lines on stdout, read in production with `fly logs` (009).

One line per `POST /v1/chunk` (event "chunk") and per failed request (event
"chunk_error"). Never log the input phrase, tokens or keys: the fields are
an allowlist built by the callers below.
"""

import json
import logging
import sys
from datetime import UTC, datetime

LOGGER_NAME = "chunker"


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        line: dict = {
            "ts": datetime.fromtimestamp(record.created, UTC).isoformat(timespec="milliseconds"),
            "level": record.levelname.lower(),
            "logger": record.name,
        }
        fields = getattr(record, "fields", None)
        if fields:
            line.update(fields)
        else:
            line["msg"] = record.getMessage()
        if record.exc_info and record.exc_info[0] is not None:
            line["exc_type"] = record.exc_info[0].__name__
        return json.dumps(line, ensure_ascii=False)


class _StdoutHandler(logging.StreamHandler):
    """Writes to whatever sys.stdout is at emit time, so pytest's capsys
    sees the lines."""

    @property
    def stream(self):  # type: ignore[override]
        return sys.stdout

    @stream.setter
    def stream(self, _value) -> None:
        pass


def configure() -> logging.Logger:
    """Give the `chunker` logger tree (incl. `chunker.full`) a JSON handler.
    Uvicorn configures only its own loggers, so ours would otherwise print
    nothing below WARNING. Idempotent."""
    logger = logging.getLogger(LOGGER_NAME)
    if not any(isinstance(h, _StdoutHandler) for h in logger.handlers):
        handler = _StdoutHandler()
        handler.setFormatter(JsonFormatter())
        logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    logger.propagate = False
    return logger


log = configure()


def log_chunk(mode: str, region: str, payload: dict) -> None:
    meta = payload.get("meta", {})
    log.info(
        "chunk",
        extra={
            "fields": {
                "event": "chunk",
                "status": 200,
                "request_id": payload.get("request_id"),
                "confidence_mode": mode,
                "region": region,
                "prompt_version": meta.get("prompt_version"),
                "cache_hit": bool(meta.get("cached")),
                "latency_ms": meta.get("latency_ms"),
                "chunks": len(payload.get("chunks", [])),
                "dropped": len(meta.get("dropped") or []),
            }
        },
    )


def log_chunk_error(status: int, code: str, exc: BaseException) -> None:
    """The exception's message is left out: some (validation errors) can echo
    the input."""
    log.warning(
        "chunk_error",
        extra={
            "fields": {
                "event": "chunk_error",
                "status": status,
                "code": code,
                "exc_type": type(exc).__name__,
            }
        },
    )
