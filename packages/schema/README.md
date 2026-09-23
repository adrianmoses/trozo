# @trozo/schema

Single source of truth for the chunk service API contract.

**Contract**: the Pydantic v2 models in `services/chunker` define both the
LLM structured-output schema and the HTTP response shape. This package will
hold the JSON Schema exported from those models plus TypeScript types
generated from it, consumed by `apps/web`.

**Status**: stub. The codegen pipeline (Pydantic → JSON Schema → TS types)
lands with feature 001, when the first Pydantic models exist. See
`docs/specs/ROADMAP.md`.
