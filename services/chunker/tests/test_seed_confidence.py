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
