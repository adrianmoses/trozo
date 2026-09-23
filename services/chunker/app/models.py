"""API contract models.

These Pydantic models are the single source of truth: FastAPI response
models, the LLM structured-output schema (via LLMDraft), and the input to
the packages/schema codegen. Confidence and example highlights are computed
by the service, never reported by the model — hence the LLMDraft subset.
"""

from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class Region(str, Enum):
    neutral = "neutral"
    ES = "ES"
    MX = "MX"
    AR = "AR"
    CO = "CO"


class Register(str, Enum):
    coloquial = "coloquial"
    neutral = "neutral"
    formal = "formal"


class NoteKind(str, Enum):
    calque = "calque"
    false_friend = "false_friend"
    preposition = "preposition"
    ser_estar = "ser_estar"
    subjunctive_trigger = "subjunctive_trigger"
    gender_or_article = "gender_or_article"
    register = "register"
    other = "other"


class ConfidenceLabel(str, Enum):
    high = "high"
    med = "med"
    low = "low"
    unrated = "unrated"


class ConfidenceMode(str, Enum):
    fast = "fast"
    full = "full"


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


# --- Request ---


class ChunkRequest(StrictModel):
    text: str = Field(min_length=1, max_length=200)
    source_lang: str = "en"
    target_lang: str = "es"
    preferred_region: Region = Region.neutral
    include_alternatives: bool = True
    confidence_mode: ConfidenceMode = ConfidenceMode.fast


# --- LLM draft (structured output) ---


class Conjugation(StrictModel):
    verb: str
    person: str
    tense: str


class DraftExample(StrictModel):
    es: str
    en: str
    conjugation: Conjugation | None = None


class DraftAlternative(StrictModel):
    surface: str
    example_es: str
    regions: list[Region]
    register: Register = Register.neutral


class DraftChunk(StrictModel):
    pattern: str
    slots: list[str] = Field(default_factory=list)
    surface: str
    gloss_en: str
    register: Register = Register.neutral
    regions: list[Region] = Field(default_factory=lambda: [Region.neutral])
    example: DraftExample
    alternatives: list[DraftAlternative] = Field(default_factory=list)


class DraftNote(StrictModel):
    kind: NoteKind
    avoid: str
    why: str
    chunk_indexes: list[int] = Field(
        default_factory=list,
        description="0-based indexes into chunks that this note relates to",
    )


class Note(StrictModel):
    kind: NoteKind
    avoid: str
    why: str
    applies_to: list[str] = Field(default_factory=list)


class LLMDraft(StrictModel):
    """What the model produces. Confidence and highlights are added later."""

    translation: str
    chunks: list[DraftChunk]
    notes: list[DraftNote] = Field(default_factory=list)


# --- Response ---


class Signals(StrictModel):
    seed: bool = False
    consistency: float | None = None
    verifier: str | None = None


class Confidence(StrictModel):
    label: ConfidenceLabel
    signals: Signals = Field(default_factory=Signals)


class Example(StrictModel):
    es: str
    en: str
    highlight: list[int] | None = None
    conjugation: Conjugation | None = None


class Alternative(StrictModel):
    surface: str
    example_es: str
    regions: list[Region]
    register: Register = Register.neutral
    confidence: Confidence


class Chunk(StrictModel):
    id: str
    pattern: str
    slots: list[str] = Field(default_factory=list)
    surface: str
    gloss_en: str
    register: Register = Register.neutral
    regions: list[Region] = Field(default_factory=lambda: [Region.neutral])
    example: Example
    confidence: Confidence
    alternatives: list[Alternative] = Field(default_factory=list)


class Meta(StrictModel):
    prompt_version: str
    model: str
    latency_ms: int
    cached: bool


class ChunkResponse(StrictModel):
    request_id: str
    input: str
    translation: str
    chunks: list[Chunk]
    notes: list[Note] = Field(default_factory=list)
    meta: Meta


class ErrorBody(StrictModel):
    code: str
    message: str


class ErrorResponse(StrictModel):
    error: ErrorBody
