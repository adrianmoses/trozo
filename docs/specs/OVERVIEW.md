# Overview

<!-- status: draft | approved -->

| Field   | Value      |
| ------- | ---------- |
| status  | approved   |
| created | 2026-09-23 |

## Product Summary <!-- required -->

trozo is a web tool that turns an English phrase into 1–5 reusable Spanish chunks — patterns like **tener ganas de** + inf., not sentence translations. Each chunk comes with a conjugated example that closely mirrors the input, regional variants tagged by region with a derived confidence label, and warnings about calques, false friends, and other non-obvious translation traps. It is a learning and portfolio project, so the eval harness (seed set, self-consistency, cross-model agreement) is a first-class deliverable, not an afterthought.

## Target Consumer <!-- required -->

English speakers learning Spanish who want reusable patterns rather than one-off sentence translations — initially the author, as a single-user tool (no auth in v1). Portfolio reviewers are a secondary audience, specifically for the eval harness and its reported metrics.

## Job To Be Done <!-- required -->

"Turn this English phrase into Spanish building blocks I can actually reuse, and tell me where a literal translation would betray me."

## Non-Goals <!-- required -->

- Input languages other than English; output languages other than Spanish.
- User accounts, auth, or multi-user sharing (a nullable `user_id` column is kept so auth stays a small change later).
- Built-in spaced repetition — export to Anki instead.

## Tech Stack <!-- required -->

Monorepo layout:

- `apps/web` — TanStack Start, TanStack Router, TanStack Query, Tailwind CSS 4, shadcn/ui, Drizzle ORM + Postgres. Server functions proxy the chunk service so LLM API keys stay server-side.
- `services/chunker` — Python 3.12, FastAPI, Pydantic v2. Provider SDKs behind a small `LLMClient` interface so primary and verifier models are swappable per eval run.
- `evals/` — YAML seed set, runner, Markdown reports (Python, shares the chunker's environment).
- `packages/schema` — JSON Schema exported from Pydantic, used to generate TS types for the web app.
- Deploy: Docker Compose locally (one `docker compose up` for demos); Fly.io/Railway-style host for web + service + Postgres.

## Testing Suite <!-- required -->

- **Web (`apps/web`)**: Vitest + Testing Library for server functions, export formatting (Anki CSV, TXT), and key components. No e2e in v1.
- **Chunk service (`services/chunker`)**: pytest over the pipeline's pure functions (normalize, validate/repair, seed match, confidence rules), with LLM calls faked.
- **Product quality bar**: the eval suite — ~120-item seed set, self-consistency runs, cross-model agreement, CLI report with metric deltas per prompt/model version. Runs on every prompt change; decision records cite eval metrics as evidence.
- TypeScript strict mode, ESLint, Prettier on the web side.

## Open Questions <!-- optional -->

- Which two models for primary and verifier (ideally different providers, so errors are less correlated)?
- Which regions to support at launch? Spec suggests ES, MX, AR, CO + neutral, then expand.
- Does the example sentence always mirror the input's person and tense, or show the most common form when the input is a bare fragment ("to look forward to")?
- Should notes include a short grammar hint (e.g. "triggers subjunctive") or stay strictly about pitfalls?
