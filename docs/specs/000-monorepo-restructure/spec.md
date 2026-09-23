# Spec: Monorepo Restructure

| Field   | Value      |
| ------- | ---------- |
| id      | 000        |
| status  | approved   |
| created | 2026-09-23 |

---

## Why <!-- required -->

The approved architecture is a four-part monorepo (`apps/web`, `services/chunker`, `evals/`, `packages/schema`), but the current repo is a flat TanStack Start app at the root. There is nowhere for the chunk service, the eval harness, or the shared schema to live. Restructuring now, before any feature code exists, makes the move nearly free; doing it after milestone 1 would mean relocating live code.

### Consumer Impact <!-- required -->

The developer is the only consumer — this is pure infrastructure and end users see no change. Feature 001 (seed v0 + chunk service) is the direct beneficiary: it starts on a running skeleton (health-checked FastAPI service, wired test runners, one-command local stack) instead of on tooling setup.

### Roadmap Fit <!-- required -->

First item on the roadmap; blocks 001 (needs `services/chunker` and `evals/` to exist) and transitively everything after. Depends on nothing.

---

## What <!-- required -->

### Acceptance Criteria <!-- required -->

- [ ] Repo root is a pnpm workspace (`pnpm-workspace.yaml`); `package-lock.json` is gone and `pnpm install` succeeds from the root.
- [ ] The existing TanStack Start app lives intact at `apps/web`: `pnpm dev` serves it and `pnpm build` succeeds after the move (path aliases, `tsr.config.json`, and drizzle config all resolved).
- [ ] Demo artifacts are removed: `src/routes/demo/`, the `todos` table, and the template home-page copy.
- [ ] `services/chunker` is a uv-managed Python 3.12 package with FastAPI; `GET /v1/health` returns 200 and one pytest passes via `uv run pytest`.
- [ ] `evals/` is a uv package stub with a runnable placeholder entry point.
- [ ] `packages/schema` exists as a stub with a README stating its contract (Pydantic → JSON Schema → TS types), no codegen yet.
- [ ] `docker compose up` starts web, chunker, and Postgres; web responds on its port and chunker's `/v1/health` returns 200.
- [ ] Vitest is wired into `apps/web` with one passing test (`pnpm test`).
- [ ] Root README documents the layout and the dev commands.

### Non-Goals <!-- required -->

- No `POST /v1/chunk` endpoint, prompts, seed items, or `LLMClient` — feature 001.
- No schema codegen pipeline — `packages/schema` is a stub only; the pipeline lands when the first Pydantic models exist (001).
- No translator UI changes beyond deleting template/demo content — feature 002.
- No deploy configuration beyond local docker-compose (Fly.io/Railway comes later).
- No CI setup (the eval GitHub Action belongs with the eval harness).

### Open Questions <!-- optional -->

None — tooling choices (pnpm, uv, full-skeleton scope) were resolved during discovery.

---

## How <!-- required -->

### Approach <!-- required -->

1. **Workspace root**: add `pnpm-workspace.yaml` (`apps/*`, `packages/*`); delete `package-lock.json`; root `package.json` keeps only workspace-wide scripts (`dev`, `build`, `test` delegating to `apps/web`) and shared dev tooling config (prettier, eslint).
2. **Move the app**: relocate `src/`, `public/`, `vite.config.ts`, `tsconfig.json`, `tsr.config.json`, `drizzle.config.ts`, `components.json`, eslint/prettier configs into `apps/web/`. Fix path-relative config (drizzle `schema`/`out` paths, `#/*` import alias, Tailwind content globs). Delete `src/routes/demo/`, the `todos` schema, and template home-page content (leave a minimal placeholder route).
3. **Chunker skeleton**: `services/chunker` with `pyproject.toml` (uv, Python 3.12, FastAPI, Pydantic v2, pytest), `app/main.py` exposing `GET /v1/health`, one test hitting it via `TestClient`.
4. **Evals stub**: `evals/` uv package with a `run.py` placeholder that prints usage and exits 0.
5. **Schema stub**: `packages/schema/README.md` describing the Pydantic → JSON Schema → TS pipeline to come.
6. **Docker Compose**: root `docker-compose.yml` with `web` (node build), `chunker` (uv image), `postgres:16` + volume; `DATABASE_URL` and chunker URL passed as env vars. Dockerfiles in `apps/web` and `services/chunker`.
7. **Vitest**: add to `apps/web` with one smoke test (e.g. a `cn()` utility test) so the harness is proven.
8. **README**: rewrite root README for the monorepo (layout table, `pnpm install`, `docker compose up`, per-package commands).

### Confidence <!-- required -->

**Level:** High

**Rationale:** Mechanical restructure using well-trodden tooling (pnpm workspaces, uv, docker-compose). The only mildly risky part is TanStack Start's path assumptions after the move — the `#/*` import map, `tsr.config.json`, and drizzle config are all path-relative — which is fully verified by `pnpm dev` and `pnpm build` passing from the new location.

### Key Decisions <!-- optional -->

- **pnpm over npm workspaces**: better monorepo ergonomics; the repo already carried a pnpm config block. The stray `package-lock.json` is deleted.
- **uv over Poetry/pip**: single fast tool for venv + deps + lockfile; modern default for Python 3.12.
- **Full skeleton over move-only**: milestone 1 should start on a running, health-checked stack, not on tooling setup.
- **`evals/` as its own uv package** (not merged into chunker): matches the approved repo layout; it calls the service over HTTP and should not import its internals.

### Testing Approach <!-- required -->

Per OVERVIEW's testing suite:

- **Web**: Vitest wired with one passing smoke test; `pnpm build` and `pnpm dev` serve as the restructure's real regression check.
- **Chunker**: one pytest against `GET /v1/health` via FastAPI `TestClient`, run with `uv run pytest`.
- **Integration**: `docker compose up` then curl web and `/v1/health` — the acceptance check that the skeleton actually runs as one stack.
- No eval-suite involvement yet (nothing to evaluate until 001).
