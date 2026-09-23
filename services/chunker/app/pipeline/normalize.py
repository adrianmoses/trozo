"""Input normalization: the first pipeline step."""

MAX_LEN = 200


class InvalidInput(ValueError):
    """Maps to HTTP 422."""


def normalize_input(text: str) -> str:
    normalized = " ".join(text.split())
    if not normalized:
        raise InvalidInput("input is empty")
    if len(normalized) > MAX_LEN:
        raise InvalidInput(f"input exceeds {MAX_LEN} characters")
    # Cheap non-English guard: an input that is mostly non-ASCII letters is
    # very unlikely to be the English phrase this service expects.
    letters = [c for c in normalized if c.isalpha()]
    if letters:
        non_ascii = sum(1 for c in letters if ord(c) > 127)
        if non_ascii / len(letters) > 0.5:
            raise InvalidInput("input does not look like English text")
    return normalized
