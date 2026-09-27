from app.pipeline import cache


def test_key_is_stable_and_sensitive() -> None:
    key = cache.cache_key("i miss you", "ES", "p1", "claude-sonnet-5")
    assert key == cache.cache_key("i miss you", "ES", "p1", "claude-sonnet-5")
    assert key != cache.cache_key("i miss you", "MX", "p1", "claude-sonnet-5")
    assert key != cache.cache_key("i miss you", "ES", "p2", "claude-sonnet-5")
    assert key != cache.cache_key("i miss you", "ES", "p1", "other-model")


def test_roundtrip(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("CHUNKER_CACHE_DIR", str(tmp_path))
    assert cache.get("missing") is None
    cache.put("k1", {"a": 1, "ñ": "según"})
    assert cache.get("k1") == {"a": 1, "ñ": "según"}


def test_cache_key_includes_the_matcher_version(monkeypatch) -> None:
    """Bug 003: cached responses were validated by the old matcher, so a
    matcher fix must not be served stale entries."""
    from app.pipeline import cache

    before = cache.cache_key("hola", "neutral", "p1", "m")
    monkeypatch.setattr(cache, "MATCHER_VERSION", cache.MATCHER_VERSION + 1)
    assert cache.cache_key("hola", "neutral", "p1", "m") != before
