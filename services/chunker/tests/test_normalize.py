import pytest

from app.pipeline.normalize import InvalidInput, normalize_input


def test_collapses_whitespace() -> None:
    assert normalize_input("  I   miss\n you ") == "I miss you"


def test_empty_rejected() -> None:
    with pytest.raises(InvalidInput):
        normalize_input("   ")


def test_too_long_rejected() -> None:
    with pytest.raises(InvalidInput):
        normalize_input("word " * 50)


def test_non_english_rejected() -> None:
    with pytest.raises(InvalidInput):
        normalize_input("Привет, как дела сегодня")


def test_english_with_accents_ok() -> None:
    assert normalize_input("I love the café") == "I love the café"
