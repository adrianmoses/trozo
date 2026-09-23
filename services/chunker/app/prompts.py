"""Versioned prompt loading. Prompts are files so versions are diffable."""

import os
from functools import lru_cache
from pathlib import Path

PROMPTS_DIR = Path(__file__).parent.parent / "prompts"
DEFAULT_VERSION = "p1"


def current_version() -> str:
    return os.environ.get("CHUNKER_PROMPT_VERSION", DEFAULT_VERSION)


@lru_cache(maxsize=8)
def load_prompt(version: str) -> str:
    path = PROMPTS_DIR / f"{version}.md"
    if not path.is_file():
        raise FileNotFoundError(f"unknown prompt version: {version}")
    return path.read_text(encoding="utf-8")
