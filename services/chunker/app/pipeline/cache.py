"""Disk cache for chunk responses. Keyed by everything that changes output."""

import hashlib
import json
import os
from pathlib import Path

DEFAULT_CACHE_DIR = ".cache/chunker"


def cache_key(normalized_text: str, region: str, prompt_version: str, model: str) -> str:
    payload = "|".join([normalized_text, region, prompt_version, model])
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _cache_dir() -> Path:
    return Path(os.environ.get("CHUNKER_CACHE_DIR", DEFAULT_CACHE_DIR))


def get(key: str) -> dict | None:
    path = _cache_dir() / f"{key}.json"
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def put(key: str, value: dict) -> None:
    directory = _cache_dir()
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{key}.json"
    path.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")
