"""Seed list loading and lemma-normalized lookup."""

import os
from functools import lru_cache
from pathlib import Path

import yaml

from app.pipeline.spanish import keys_overlap, lemma_key


def default_seed_path(module_file: Path | None = None) -> Path | None:
    """The repo's seed file, found from this module's place in the repo:
    services/chunker/app/pipeline/seed.py -> parents[4] is the repo root
    (bug 001). Outside the repo layout, e.g. /app/app/pipeline/seed.py in the
    Docker image, there is no such parent and this returns None; there the
    seed comes from CHUNKER_SEED_PATH. Resolved lazily, never at import, so a
    shallow install cannot crash on import (bug 002)."""
    parents = (module_file or Path(__file__)).parents
    if len(parents) <= 4:
        return None
    return parents[4] / "evals" / "seed" / "seed_v0.yaml"


class SeedIndex:
    """Maps normalized chunk surface -> set of region tags seen in the seed."""

    def __init__(self, entries: dict[str, set[str]]) -> None:
        self._entries = entries

    def regions_for(self, key: str) -> set[str] | None:
        exact = self._entries.get(key)
        if exact is not None:
            return exact
        # Optional words ('tener (muchas) ganas de') make exact key equality
        # too strict; fall back to in-order containment either way.
        for seed_key, regions in self._entries.items():
            if keys_overlap(key, seed_key):
                return regions
        return None

    def __len__(self) -> int:
        return len(self._entries)


def build_index(items: list[dict]) -> SeedIndex:
    entries: dict[str, set[str]] = {}
    for item in items:
        for expected in item.get("expected_chunks", []):
            key = lemma_key(expected["surface"])
            if not key:
                continue
            entries.setdefault(key, set()).update(expected.get("regions", ["neutral"]))
    return SeedIndex(entries)


@lru_cache(maxsize=1)
def load_seed_index() -> SeedIndex:
    env = os.environ.get("CHUNKER_SEED_PATH")
    path = Path(env) if env else default_seed_path()
    if path is None or not path.is_file():
        return SeedIndex({})
    items = yaml.safe_load(path.read_text(encoding="utf-8")) or []
    return build_index(items)
