"""Fast-mode confidence: derived from the seed list, never model-reported.

Scored per chunk and per region tag: a chunk can be right while its region
tag is wrong. Rules (001, fast mode only): seed match on chunk AND region
-> high ("verified"); anything else -> unrated until full mode (003).
"""

from app.models import Confidence, ConfidenceLabel, Region, Signals
from app.pipeline.seed import SeedIndex
from app.pipeline.spanish import lemma_key


def fast_confidence(surface: str, regions: list[Region], index: SeedIndex) -> Confidence:
    seed_regions = index.regions_for(lemma_key(surface))
    if seed_regions is not None and any(r.value in seed_regions for r in regions):
        return Confidence(label=ConfidenceLabel.high, signals=Signals(seed=True))
    return Confidence(label=ConfidenceLabel.unrated, signals=Signals(seed=False))
