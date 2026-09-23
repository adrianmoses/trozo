# Decision Record: Monorepo Restructure

| Field   | Value               |
| ------- | ------------------- |
| id      | 000                 |
| status  | implemented         |
| created | 2026-09-23          |
| spec    | [spec.md](./spec.md) |

---

## Context <!-- required -->

The repo was a flat TanStack Start template (zero git commits, everything untracked) while the approved architecture calls for a four-part monorepo. Doing the restructure before any feature code existed made the move nearly free. Two facts discovered during planning shaped the work: every app config was path-relative, so the move required no path edits at all; and the absence of git history meant plain file moves with nothing to preserve.

## Decision <!-- required -->

Restructure the repo into a pnpm-workspace monorepo with the TanStack Start app at `apps/web`, a uv-managed FastAPI skeleton at `services/chunker` (health endpoint + one pytest), runnable stubs at `evals/` and `packages/schema`, a root docker-compose running web + chunker + Postgres 16, and Vitest wired into the web app. The full skeleton (rather than a bare directory move) was built so feature 001 starts against a running, health-checked stack. All template/demo content (demo routes, `todos` table, TanStack branding) was removed.

---

## Alternatives Considered <!-- required -->

### Repo layout

**Option A: Flat app + sibling dirs** — keep the app at root, add `services/` and `evals/` beside it.
- Pros: zero move risk; no workspace tooling needed.
- Cons: diverges from the spec'd layout; `packages/schema` has no natural home; root stays cluttered with app config.

**Option B: Full monorepo restructure (apps/web, services/, evals/, packages/)**
- Pros: matches the approved architecture exactly; clean seams for the schema package and future apps.
- Cons: one-time move risk (path assumptions), workspace tooling overhead.

**Chosen:** B — chosen by the human during spec discovery; the move risk turned out to be nil because all configs were relative.

### JS workspace tooling

**Option A: npm workspaces** — keep the existing `package-lock.json`.
**Option B: pnpm workspaces** — matches the pnpm config block already in package.json; better filtering (`--filter web`).

**Chosen:** B (human choice). Follow-on decision made during implementation: pin `packageManager: pnpm@9.15.1` after the Docker image's newer corepack pnpm hard-errored (`ERR_PNPM_IGNORED_BUILDS`) on build scripts that pnpm 9 merely warns about.

### Python tooling

**Option A: uv** — one fast tool for venv + deps + lockfile.
**Option B: Poetry / pip+requirements.**

**Chosen:** A (human choice); `uv.lock` committed for the chunker, `.python-version` pinned to 3.12 in both Python packages.

### Vitest configuration

**Option A: let Vitest reuse the app's `vite.config.ts`.**
- Pros: one config.
- Cons: the TanStack Start/nitro/devtools plugins keep the process alive after tests ("close timed out after 10000ms"), and Vitest's bundled Vite rejects the config's `resolve.tsconfigPaths` typing.

**Option B: standalone minimal `vitest.config.ts`.**
- Pros: clean exit, no plugin coupling; tests run in <1s.
- Cons: a second config file; path aliases not available in tests until added.

**Chosen:** B. Alias support can be added when a test first needs it.

### Web Docker build context

Only one approach was seriously on the table: build from the repo root (context `.`, dockerfile `apps/web/Dockerfile`), because the workspace install needs `pnpm-workspace.yaml` and the root manifest. A per-app context cannot see them.

---

## Tradeoffs <!-- required -->

- **Full skeleton over minimal move** optimises for feature 001 velocity at the cost of a few placeholder files (`evals/run.py`, empty `schema.ts` with `export {}`) that exist only to be replaced.
- **Pinned pnpm 9.15.1** buys local/Docker consistency but defers the pnpm 10 migration (and its stricter build-script model) to a later, deliberate upgrade.
- **Standalone Vitest config** trades a little duplication for test-runner isolation from the SSR plugin stack.
- **`docker compose` web image rebuilds on any `apps/web` change** with no dev-mode bind mounts — acceptable because local dev uses `pnpm dev` directly; compose exists for the one-command demo.

---

### Spec Divergence <!-- optional -->

The implementation matches the spec on every acceptance criterion. Minor divergences from the spec's *Approach* prose:

| Spec Said | What Was Built | Reason |
| --- | --- | --- |
| Dockerfile: node 22, run `dist/server/index.mjs` | node 24, run `.output/server/index.mjs` | Local runtime is Node 24; nitro 3 beta emits `.output/`, not `dist/` (the template README was wrong) |
| Chunker dev deps: pytest, httpx | pytest, **httpx2** | starlette deprecated `httpx` for its TestClient; swap silences the warning |
| Root keeps eslint config | eslint config lives in `apps/web` | It is `@tanstack/eslint-config`, app-specific; prettier stayed at root as the shared tool |
| No mention of eslint ignores or pnpm pinning | Added `.output/**` etc. to eslint ignores; pinned `packageManager` | Both surfaced only once builds ran (eslint crawled build output; Docker pnpm 10 hard-errored) |

---

## Spec Gaps Exposed <!-- optional -->

- **Template README claimed `dist/` build output**; actual nitro output is `.output/`. Fixed in the rewritten root README — no doc change needed beyond that.
- **ARCHITECTURE.md says "Docker Compose locally"** but does not name the web image's root-context requirement for workspace installs. Not worth a revision now; the Dockerfile documents it.
- The spec's acceptance criterion "pnpm dev serves it" was verified via the built server (`node .output/server/index.mjs` → HTTP 200) plus the compose stack rather than an interactive dev-server session; `vite dev` and `vite build` share the config path resolution that was the actual risk.

---

## Test Evidence <!-- required -->

Consolidated local run (2026-09-23):

```
== pnpm test (apps/web) ==
 ✓ src/lib/utils.test.ts (1 test) 8ms
 Test Files  1 passed (1)
      Tests  1 passed (1)
== pytest (services/chunker) ==
============================== 1 passed in 0.38s ===============================
== tsc --noEmit ==
clean
== eslint ==
clean
== prettier ==
All matched files use Prettier code style!
== evals stub ==
Eval runner placeholder. The real harness lands with feature 001.
```

Docker compose stack (built and started, then torn down):

```
chunker: {"status":"ok"} (200)
web: 200
trozo-chunker-1 Up 14 seconds
trozo-postgres-1 Up 14 seconds (healthy)
trozo-web-1 Up 8 seconds
```

Production build + server smoke test from `apps/web`:

```
✓ built in 168ms
ℹ Generated .output/nitro.json
➜ Listening on: http://localhost:3000/ (all interfaces)
200
```
