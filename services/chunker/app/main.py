import os
import secrets
import time
import uuid

from fastapi import Depends, FastAPI, Header, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.llm import AnthropicLLMClient, LLMClient, LLMError, LLMRateLimited
from app.models import (
    Alternative,
    Chunk,
    ChunkRequest,
    ChunkResponse,
    ConfidenceMode,
    Example,
    LLMDraft,
    Meta,
    Note,
    NoteKind,
    Region,
)
from app.pipeline import cache
from app.pipeline.confidence import fast_confidence
from app.pipeline.normalize import InvalidInput, normalize_input
from app.pipeline.seed import load_seed_index
from app.pipeline.spanish import highlight_range
from app.pipeline.validate import validate_repair
from app.prompts import current_version, load_prompt

app = FastAPI(title="trozo chunk service")


def _error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message}})


@app.exception_handler(InvalidInput)
async def invalid_input_handler(_: Request, exc: InvalidInput) -> JSONResponse:
    return _error(422, "invalid_input", str(exc))


@app.exception_handler(RequestValidationError)
async def request_validation_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    return _error(422, "invalid_input", str(exc.errors()[0].get("msg", "invalid request")))


@app.exception_handler(LLMError)
async def llm_error_handler(_: Request, exc: LLMError) -> JSONResponse:
    return _error(502, "llm_failure", str(exc))


@app.exception_handler(LLMRateLimited)
async def llm_rate_limited_handler(_: Request, exc: LLMRateLimited) -> JSONResponse:
    return _error(503, "llm_rate_limited", str(exc))


class Unauthorized(Exception):
    pass


@app.exception_handler(Unauthorized)
async def unauthorized_handler(_: Request, exc: Unauthorized) -> JSONResponse:
    return _error(401, "unauthorized", str(exc) or "missing or invalid service token")


def require_token(authorization: str | None = Header(default=None)) -> None:
    """Opt-in shared-secret check for the chunk endpoint.

    Reads CHUNKER_TOKEN per request (never at import). Unset means open, so
    local dev and the test suite need no configuration. Health and meta are
    never guarded.
    """
    expected = os.environ.get("CHUNKER_TOKEN")
    if not expected:
        return
    provided = ""
    if authorization and authorization.lower().startswith("bearer "):
        provided = authorization[7:].strip()
    if not provided or not secrets.compare_digest(provided, expected):
        raise Unauthorized("missing or invalid service token")


def get_llm() -> LLMClient:
    llm = getattr(app.state, "llm", None)
    if llm is None:
        llm = AnthropicLLMClient()
        app.state.llm = llm
    return llm


@app.get("/v1/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/v1/meta")
def meta() -> dict:
    return {
        "regions": [r.value for r in Region],
        "note_kinds": [k.value for k in NoteKind],
        "prompt_version": current_version(),
    }


def _user_message(text: str, region: Region) -> str:
    return f'Input (preferred_region: {region.value}): "{text}"'


def _generate_draft(llm: LLMClient, system: str, text: str, region: Region) -> tuple[LLMDraft, list[str]]:
    """One structured call, validated; one retry with errors appended when the
    draft loses all its chunks to validation."""
    draft = llm.generate_structured(system, _user_message(text, region), LLMDraft)
    repaired, errors = validate_repair(draft)
    if repaired.chunks or not draft.chunks:
        return repaired, errors
    retry_user = (
        _user_message(text, region)
        + "\n\nYour previous answer had these problems — fix them:\n- "
        + "\n- ".join(errors)
    )
    draft = llm.generate_structured(system, retry_user, LLMDraft)
    repaired, errors = validate_repair(draft)
    return repaired, errors


def _assemble(request_id: str, text: str, draft: LLMDraft, meta: Meta) -> ChunkResponse:
    index = load_seed_index()
    chunks: list[Chunk] = []
    for i, dc in enumerate(draft.chunks):
        chunks.append(
            Chunk(
                id=f"ch_{i + 1}",
                pattern=dc.pattern,
                slots=dc.slots,
                surface=dc.surface,
                gloss_en=dc.gloss_en,
                register=dc.register,
                regions=dc.regions,
                example=Example(
                    es=dc.example.es,
                    en=dc.example.en,
                    highlight=highlight_range(dc.example.es, dc.surface),
                    conjugation=dc.example.conjugation,
                ),
                translation_highlight=highlight_range(draft.translation, dc.surface),
                confidence=fast_confidence(dc.surface, dc.regions, index),
                alternatives=[
                    Alternative(
                        surface=alt.surface,
                        example_es=alt.example_es,
                        regions=alt.regions,
                        register=alt.register,
                        confidence=fast_confidence(alt.surface, alt.regions, index),
                    )
                    for alt in dc.alternatives
                ],
            )
        )
    notes = [
        Note(
            kind=dn.kind,
            avoid=dn.avoid,
            why=dn.why,
            applies_to=[f"ch_{i + 1}" for i in dn.chunk_indexes if 0 <= i < len(chunks)],
        )
        for dn in draft.notes
    ]
    return ChunkResponse(
        request_id=request_id,
        input=text,
        translation=draft.translation,
        chunks=chunks,
        notes=notes,
        meta=meta,
    )


@app.post("/v1/chunk", dependencies=[Depends(require_token)])
def chunk(request: ChunkRequest) -> JSONResponse:
    started = time.monotonic()
    text = normalize_input(request.text)
    llm = get_llm()
    version = current_version()

    key = cache.cache_key(text, request.preferred_region.value, version, llm.model)
    cached = cache.get(key)
    if cached is not None:
        cached["meta"]["cached"] = True
        cached["meta"]["latency_ms"] = int((time.monotonic() - started) * 1000)
        return JSONResponse(content=cached)

    system = load_prompt(version)
    draft, _errors = _generate_draft(llm, system, text, request.preferred_region)

    # 001 implements fast mode only; a `full` request still gets a fast answer.
    _ = request.confidence_mode is ConfidenceMode.full

    response = _assemble(
        request_id=f"req_{uuid.uuid4().hex[:12]}",
        text=text,
        draft=draft,
        meta=Meta(
            prompt_version=version,
            model=llm.model,
            latency_ms=int((time.monotonic() - started) * 1000),
            cached=False,
        ),
    )
    payload = response.model_dump(mode="json")
    cache.put(key, payload)
    return JSONResponse(content=payload)
