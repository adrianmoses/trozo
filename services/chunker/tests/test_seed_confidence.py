from app.models import ConfidenceLabel, Region
from app.pipeline.confidence import fast_confidence
from app.pipeline.seed import build_index


def make_index():
    return build_index(
        [
            {
                "id": "excited-01",
                "expected_chunks": [
                    {"surface": "tener ganas de", "regions": ["neutral"]},
                    {"surface": "me hace ilusión", "regions": ["ES"]},
                ],
            }
        ]
    )


def test_seed_match_chunk_and_region_high() -> None:
    conf = fast_confidence("tengo ganas de", [Region.neutral], make_index())
    assert conf.label is ConfidenceLabel.high
    assert conf.signals.seed is True


def test_seed_match_wrong_region_unrated() -> None:
    conf = fast_confidence("me hace ilusión", [Region.MX], make_index())
    assert conf.label is ConfidenceLabel.unrated


def test_no_seed_match_unrated() -> None:
    conf = fast_confidence("estar re manija", [Region.AR], make_index())
    assert conf.label is ConfidenceLabel.unrated
    assert conf.signals.seed is False


def test_seed_match_with_optional_word_high() -> None:
    # spike finding: 'tener muchas ganas de' must hit seed 'tener ganas de'
    conf = fast_confidence("tener muchas ganas de", [Region.neutral], make_index())
    assert conf.label is ConfidenceLabel.high


# --- bug 001: default seed path (written before the fix; failed before it) ---


def test_default_seed_path_points_at_the_repo_seed_file() -> None:
    from pathlib import Path

    from app.pipeline.seed import default_seed_path

    repo_root = Path(__file__).resolve().parents[3]
    path = default_seed_path()
    assert path is not None
    assert path.resolve() == repo_root / "evals" / "seed" / "seed_v0.yaml"
    assert path.is_file()


def test_seed_index_loads_without_env_override(monkeypatch) -> None:
    from app.pipeline.seed import load_seed_index
    from app.pipeline.spanish import lemma_key

    monkeypatch.delenv("CHUNKER_SEED_PATH", raising=False)
    load_seed_index.cache_clear()
    try:
        index = load_seed_index()
        assert len(index) > 0
        assert "ES" in (index.regions_for(lemma_key("echar de menos")) or set())
    finally:
        load_seed_index.cache_clear()


# --- bug 002: chunker image crashed on import (written before the fix) ---


def test_default_seed_path_is_none_in_the_image_layout() -> None:
    """In the image the module is /app/app/pipeline/seed.py: too shallow for
    the repo layout. Resolving the default must not raise."""
    from pathlib import Path

    from app.pipeline.seed import default_seed_path

    assert default_seed_path(Path("/app/app/pipeline/seed.py")) is None


def test_seed_index_uses_env_path_when_no_repo_default(monkeypatch, tmp_path) -> None:
    from app.pipeline import seed as seed_module
    from app.pipeline.spanish import lemma_key

    seed = tmp_path / "seed.yaml"
    seed.write_text(
        "- id: x\n  expected_chunks:\n    - surface: echar de menos\n      regions: [ES]\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(seed_module, "default_seed_path", lambda *_: None)
    monkeypatch.setenv("CHUNKER_SEED_PATH", str(seed))
    seed_module.load_seed_index.cache_clear()
    try:
        index = seed_module.load_seed_index()
        assert index.regions_for(lemma_key("echar de menos")) == {"ES"}
    finally:
        seed_module.load_seed_index.cache_clear()


def test_seed_index_is_empty_without_env_or_repo_default(monkeypatch) -> None:
    from app.pipeline import seed as seed_module

    monkeypatch.setattr(seed_module, "default_seed_path", lambda *_: None)
    monkeypatch.delenv("CHUNKER_SEED_PATH", raising=False)
    seed_module.load_seed_index.cache_clear()
    try:
        assert len(seed_module.load_seed_index()) == 0
    finally:
        seed_module.load_seed_index.cache_clear()
