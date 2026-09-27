"""Spanish text utilities: lemma-level matching and highlight computation.

All matching is done on normalized lemma sequences: lowercase, accents
stripped (matching only), parenthesized optionals and slot pills removed,
every token lemmatized with spaCy es_core_news_sm.
"""

import re
import unicodedata
from functools import lru_cache

import spacy
from spacy.language import Language

_PARENS = re.compile(r"\([^)]*\)")
_SLOT_TAIL = re.compile(r"\+\s*\S+\.?")

MAX_GAP = 2  # tokens allowed between chunk lemmas in gapped matching


@lru_cache(maxsize=1)
def get_nlp() -> Language:
    return spacy.load("es_core_news_sm", disable=["parser", "ner"])


def strip_accents(text: str) -> str:
    decomposed = unicodedata.normalize("NFD", text)
    return "".join(c for c in decomposed if not unicodedata.combining(c))


def clean_surface(surface: str) -> str:
    """Remove parenthesized optionals and slot pills like '+ inf.'."""
    cleaned = _PARENS.sub(" ", surface)
    cleaned = _SLOT_TAIL.sub(" ", cleaned)
    return " ".join(cleaned.split())


def _lemma(token) -> str:
    """Normalized lemma. spaCy expands a verb with attached clitics into a
    two-word lemma ('postularse' -> 'postular él', 'darme' -> 'dar yo'); keep
    the verb. Bug 003: a regex used to strip clitic-looking endings from the
    surface instead, and also mangled nouns ('suerte' -> 'suer')."""
    lemma = token.lemma_.lower()
    if token.pos_ in ("VERB", "AUX") and " " in lemma:
        lemma = lemma.split()[0]
    return strip_accents(lemma)


def lemmas(text: str) -> list[str]:
    doc = get_nlp()(text)
    return [_lemma(t) for t in doc if not t.is_punct and not t.is_space]


def lemma_key(surface: str) -> str:
    """Canonical matching key for a chunk surface."""
    return " ".join(lemmas(clean_surface(surface.lower())))


_VERB_ENDINGS = ("arse", "erse", "irse", "ar", "er", "ir")
_MIN_STEM = 3


def _stem(token: str) -> str | None:
    """Infinitive stem of a verb-looking token, e.g. 'extrañar' -> 'extran'."""
    for ending in _VERB_ENDINGS:
        if token.endswith(ending) and len(token) - len(ending) >= _MIN_STEM:
            return token[: -len(ending)]
    return None


def _token_matches(hay: tuple[str, str], needle_tok: str | tuple[str, str]) -> bool:
    """hay and needle_tok are (lemma, surface), both normalized; a needle may
    also be a bare key token. Lenient on purpose: the small spaCy model
    mis-lemmatizes some conjugations and clitics (e.g. 'extraño' -> adjective,
    'postularme'), and lemmatizes some nouns differently alone than in a
    sentence ('pajita' -> 'pajito', bug 003). So either form of the needle may
    match either form of the text, backed up by a verb-stem prefix match."""
    lemma, surface = hay
    candidates = (needle_tok,) if isinstance(needle_tok, str) else needle_tok
    for tok in candidates:
        if tok in (lemma, surface):
            return True
        # contractions: 'al' = a + el, 'del' = de + el
        if surface in ("al", "del") and tok in ("a", "de", "el"):
            return True
        stem = _stem(tok)
        if stem is not None and (lemma.startswith(stem) or surface.startswith(stem)):
            return True
    return False


def _find_subsequence(
    haystack: list[tuple[str, str]], needle: list, max_gap: int
) -> tuple[int, int] | None:
    """Find needle in haystack in order, allowing up to max_gap tokens
    between consecutive needle tokens. Returns (start, end) token indices."""
    if not needle:
        return None
    for start in range(len(haystack)):
        if not _token_matches(haystack[start], needle[0]):
            continue
        pos = start
        ok = True
        for target in needle[1:]:
            nxt = None
            for j in range(pos + 1, min(pos + 2 + max_gap, len(haystack))):
                if _token_matches(haystack[j], target):
                    nxt = j
                    break
            if nxt is None:
                ok = False
                break
            pos = nxt
        if ok:
            return (start, pos)
    return None


def _token_pairs(text: str) -> tuple[list, list[tuple[str, str]]]:
    doc = get_nlp()(text)
    tokens = [t for t in doc if not t.is_punct and not t.is_space]
    pairs = [(_lemma(t), strip_accents(t.text.lower())) for t in tokens]
    return tokens, pairs


def _needle(surface: str) -> list[tuple[str, str]]:
    """(lemma, surface) per token of a chunk surface."""
    _, pairs = _token_pairs(clean_surface(surface.lower()))
    return pairs


def contains_chunk(text: str, surface: str) -> bool:
    """Lemma-level: does the chunk appear (possibly conjugated) in text?"""
    _, pairs = _token_pairs(text)
    return _find_subsequence(pairs, _needle(surface), MAX_GAP) is not None


def highlight_range(text: str, surface: str) -> list[int] | None:
    """Character range [start, end) of the chunk inside text, or None."""
    tokens, pairs = _token_pairs(text)
    needle = _needle(surface)
    span = _find_subsequence(pairs, needle, MAX_GAP)
    if span is None:
        return None
    first, last = tokens[span[0]], tokens[span[1]]
    return [first.idx, last.idx + len(last.text)]


def keys_overlap(key_a: str, key_b: str) -> bool:
    """Do two lemma keys refer to the same chunk, allowing optional words?
    True when the shorter key is an in-order subsequence of the longer one
    (gaps allowed), e.g. 'tener gana de' vs 'tener mucho gana de'."""
    a, b = key_a.split(), key_b.split()
    if not a or not b:
        return False
    short, long_ = (a, b) if len(a) <= len(b) else (b, a)
    return _find_subsequence([(t, t) for t in long_], short, MAX_GAP) is not None
