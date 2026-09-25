"""Fast-mode confidence: derived from the seed list, never model-reported.

Scored per chunk and per region tag: a chunk can be right while its region
tag is wrong. Rules (001, fast mode only): seed match on chunk AND region
-> high ("verified"); anything else -> unrated until full mode (003).
"""

from app.models import Confidence, ConfidenceLabel, Region, Signals
from app.pipeline.seed import SeedIndex
from app.pipeline.spanish import lemma_key


def seed_matches(surface: str, regions: list[str], index: SeedIndex) -> bool:
    """Chunk AND region found in the seed list."""
    seed_regions = index.regions_for(lemma_key(surface))
    return seed_regions is not None and any(str(r) in seed_regions for r in regions)


def fast_confidence(surface: str, regions: list[Region], index: SeedIndex) -> Confidence:
    if seed_matches(surface, [r.value for r in regions], index):
        return Confidence(label=ConfidenceLabel.high, signals=Signals(seed=True))
    return Confidence(label=ConfidenceLabel.unrated, signals=Signals(seed=False))


def refresh_seed(payload: dict, index: SeedIndex) -> dict:
    """Recompute the seed signal on a stored (cached) response.

    The seed is data that changes independently of cached responses (it was
    empty outside Docker until bug 001 was fixed, and 005 grows it), so the
    signal is re-derived on every read rather than trusted from the cache.
    Fast-mode labels are seed-only: `high` when seeded, otherwise `unrated`
    unless full-mode signals are present, in which case the caller relabels.
    """
    for chunk in payload.get("chunks", []):
        for target in [chunk, *(chunk.get("alternatives") or [])]:
            conf = target.setdefault("confidence", {"label": "unrated"})
            signals = conf.setdefault("signals", {})
            seeded = seed_matches(target["surface"], target.get("regions") or ["neutral"], index)
            signals["seed"] = seeded
            has_full_signals = (
                signals.get("consistency") is not None or signals.get("verifier") is not None
            )
            if not has_full_signals:
                conf["label"] = "high" if seeded else "unrated"
    return payload
