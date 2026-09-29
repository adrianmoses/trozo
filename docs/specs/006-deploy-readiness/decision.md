# Decision Record: Deploy Readiness

| Field   | Value                |
| ------- | -------------------- |
| id      | 006                  |
| status  | implemented          |
| created | 2026-09-29           |
| spec    | [spec.md](./spec.md) |

---

## Context <!-- required -->

006 is the first of the production items (006–009). It had to make both Docker images and the web app's code safe and runnable on Fly.io with Neon before any Fly app exists. By the time implementation started, the author had created the Neon project (`aws-eu-central-1`, Frankfurt) and bought the domain `trozoapp.com`. Access setup waits until 008.

Discoveries during implementation:

- **Seed file.** The seed gap found while writing the spec was real. The chunker image had no seed, and Compose hid that with a bind mount.
- **Migration bundle.** An ESM esbuild bundle of `pg` (CommonJS) fails at startup with `Dynamic require of "events" is not supported`. It needs a `createRequire` banner.
- **Port 5432 is shadowed.** On the author's machine, a native Postgres listens on `127.0.0.1:5432` alongside Compose's container. `localhost:5432` reaches the native server (`role "trozo" does not exist`), so the Postgres integration tests were run against a throwaway container on another port.

## Decision <!-- required -->

- **Access check.** The web app checks the Cloudflare Access JWT in TanStack Start global request middleware (`src/start.ts`). The logic is pure and lives in `src/server/access.server.ts`, using `jose` with the team's remote key set.
  - The check is **on** when `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` are set.
  - On Fly (`FLY_APP_NAME` set) without them, the app **fails closed** with 503.
  - Off Fly without them, it is **off**.
  - `/healthz` is always exempt.
- **Migrations** run from the runtime image as `node migrate.mjs`. This is drizzle-orm's node-postgres migrator, bundled by esbuild (`pnpm --filter web build:migrate`) and shipped with `drizzle/`. Compose's `migrate` service now runs it, and Fly's `release_command` will too (008).
- **Health check.** The web app gets a liveness-only `GET /healthz`.
- **Database connection.** `src/db/index.ts` sets a 10 s connection timeout. TLS comes from `sslmode=verify-full` in Neon's pooled URL.
- **Chunker image.** It builds from the repo root and bakes in `evals/seed/seed_v1.yaml`, with `CHUNKER_SEED_PATH` and `CHUNKER_CACHE_DIR` set in the image. `/v1/meta` reports `seed_entries` so a deploy can check the seed is loaded.
- **Config inventory.** `docs/DEPLOY.md` lists every production env var and secret per app.

The goal is that 007 and 008 are pure infrastructure work: the same images already run correctly in Compose and under a simulated Fly environment.

---

## Alternatives Considered <!-- required -->

### Where the Access check runs

**Option A:** TanStack Start global request middleware (`createStart({ requestMiddleware })`).

- Pros: one place, typed, and part of the app. The spike confirmed it runs before SSR pages, server routes (`/api/export`) and server-function endpoints (`/_serverFn/*`). A bogus server-function id returned 403 with the middleware and 500 without it, which shows it runs before handler lookup.
- Cons: Nitro serves static assets before it.

**Option B:** Nitro server middleware in front of the Start handler.

- Pros: would also cover static assets.
- Cons: sits outside Start's conventions, and reaching it from the Vite plugin setup is less direct.

**Chosen:** A. The spike showed full coverage of everything that touches data or LLM credit. Static bundles hold no data or keys (the spec's open question, resolved as acceptable).

### What happens on Fly when Access isn't configured

**Option A:** fail closed on `FLY_APP_NAME` (503 for everything but `/healthz`).

- Pros: production can't run unprotected by accident, and local work needs no setup.
- Cons: ties behaviour to a Fly-specific variable. Another host would need its own signal.

**Option B:** an explicit `REQUIRE_ACCESS=true` flag.

- Pros: host-neutral.
- Cons: forgetting it leaves production open.

**Chosen:** A, the author's choice during discovery.

### How migrations run from the runtime image

**Option A:** drizzle-orm's migrator, bundled into one `migrate.mjs`.

- Pros: about 370 KB, with no dev tooling or `node_modules` in the runtime image. It uses drizzle-kit's journal table (`drizzle.__drizzle_migrations`), so `pnpm db:migrate` and the script are interchangeable.
- Cons: one more build step, and the ESM bundle needs a `createRequire` banner for `pg`.

**Option B:** install drizzle-kit and its config in the runtime image.

- Pros: identical to local dev.
- Cons: a bigger image with dev tooling in production.

**Chosen:** A, the author's choice during discovery.

### How the seed reaches the production chunker

**Option A:** bake it into the image, moving the build context to the repo root.

- Pros: the seed is versioned with the code, and the image is self-contained.
- Cons: the chunker build context is now the repo root, which a new root `.dockerignore` keeps small.

**Option B:** put it on the chunker's Fly volume.

- Pros: the build stays unchanged.
- Cons: the volume would drift from the commit, and would need a separate copy step on every seed change.

**Chosen:** A. The volume stays for the response cache only.

### Health check depth

**Option A:** liveness only.

**Option B:** ping Postgres on each check.

- Cons: a check every few seconds would keep Neon's compute awake and billed around the clock.

**Chosen:** A. A broken database shows up as failing requests and in logs.

---

## Tradeoffs <!-- required -->

- **Static assets are public** on the `*.fly.dev` hostname. JS and CSS bundles can be fetched without Access. They contain no data, keys or saved chunks.
- **The Access config is read once per process.** Changing it needs a restart, which on Fly happens anyway, because changing a secret or config redeploys.
- **Fail-closed depends on `FLY_APP_NAME`.** Moving off Fly means revisiting the check.
- **The liveness check can't see the database.** A dead Neon connection doesn't mark the web machine unhealthy.
- **The chunker needs the repo root to build.** `docker build -f services/chunker/Dockerfile .`; building from `services/chunker` no longer works.
- **Compose no longer uses the live seed file.** Editing `evals/seed/seed_v1.yaml` needs a rebuild to show up in Compose. `pnpm dev:all` still reads it straight from the repo.

---

### Spec Divergence <!-- optional -->

| Spec Said                                                                  | What Was Built                                                                                         | Reason                                                                                                                                                  |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `seed_entries` is optional in the contract; regenerate schema and TS types | `seed_entries` added to `/v1/meta` only; nothing regenerated                                           | `/v1/meta` returns a plain dict and is not part of the Pydantic contract or `packages/schema`, so there was nothing to regenerate.                      |
| esbuild bundles `migrate.ts` with `pg-native` external                     | Also a `createRequire` banner, as a `build:migrate` package script writing `apps/web/dist/migrate.mjs` | Without the banner, the ESM bundle crashes on `pg`'s `require('events')`. A script keeps the command in one place for the Dockerfile and for local use. |
| (not in spec)                                                              | `.gitignore` now ignores `.env.*` except `.env.example`                                                | An untracked `.env.production` appeared at the repo root during implementation and was not covered by `.env` or `*.local`.                              |
| (not in spec)                                                              | Compose's chunker no longer sets `CHUNKER_SEED_PATH` and `CHUNKER_CACHE_DIR`                           | The image sets both now, so Compose and Fly share one source.                                                                                           |
| `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` as values Access supplies      | DEPLOY.md lists the team domain as plain config and the AUD as a Fly secret                            | ROADMAP lists "the Access audience" among the secrets. The team domain is visible to anyone who reaches the login page.                                 |

Otherwise the implementation matches the spec.

---

## Spec Gaps Exposed <!-- optional -->

- **The README's integration-test command assumes nothing else is on `localhost:5432`.** On a machine with a native Postgres, `TEST_DATABASE_URL=postgres://trozo:trozo@localhost:5432/trozo` reaches the wrong server. This is environment-specific and not changed here. If it recurs, map Compose's Postgres to another host port.
- **Access and previews (009).** A preview app on Fly also has `FLY_APP_NAME` set, so it fails closed until it gets Access values. That is the intended behaviour, and 009 must provide a preview Access application or a shared audience.
- **Local Compose exercises "off" only.** The `on` path runs against Cloudflare's real key set only once Access exists (008). Unit tests cover it with a local key set, and the image test covered missing and invalid tokens.

---

## Test Evidence <!-- required -->

Web (Vitest), with the Postgres integration suite enabled against a throwaway `postgres:16` container:

```
$ TEST_DATABASE_URL=postgres://trozo:trozo@localhost:55433/trozo pnpm --filter web test
 Test Files  24 passed (24)
      Tests  139 passed (139)

 ✓ src/server/access.server.test.ts > accessConfig > is off without Access values off Fly
 ✓ src/server/access.server.test.ts > accessConfig > fails closed on Fly when values are missing
 ✓ src/server/access.server.test.ts > accessConfig > is on with both values, normalizing the team domain
 ✓ src/server/access.server.test.ts > verifyAccessJwt > accepts a valid token
 ✓ src/server/access.server.test.ts > verifyAccessJwt > rejects a token with a wrong audience
 ✓ src/server/access.server.test.ts > verifyAccessJwt > rejects a token with a wrong issuer
 ✓ src/server/access.server.test.ts > verifyAccessJwt > rejects a token with a past expiry
 ✓ src/server/access.server.test.ts > verifyAccessJwt > rejects a token signed by another key
 ✓ src/server/access.server.test.ts > verifyAccessJwt > rejects a malformed token
 ✓ src/server/access.server.test.ts > accessDecision > always lets the health check through
 ✓ src/server/access.server.test.ts > accessDecision > lets everything through when off
 ✓ src/server/access.server.test.ts > accessDecision > returns 503 naming the missing variables when misconfigured
 ✓ src/server/access.server.test.ts > accessDecision > returns 403 without a token and logs no token
 ✓ src/server/access.server.test.ts > accessDecision > returns 403 for an invalid token without logging it
 ✓ src/server/access.server.test.ts > accessDecision > lets a valid token through
 ✓ src/server/saved.server.test.ts (6 tests)

$ pnpm --filter web lint            # clean
$ pnpm --filter web exec tsc --noEmit
tsc: ok
$ npx prettier --check .
All matched files use Prettier code style!
```

Chunker (pytest):

```
$ uv run pytest -q
87 passed in 3.48s

tests/test_api.py::test_meta_endpoint PASSED
tests/test_api.py::test_meta_reports_loaded_seed_entries PASSED
```

Validation spike (production build, `node .output/server/index.mjs`, reject-all middleware):

```
/ -> 403
/saved -> 403
/api/export?format=csv -> 403
/healthz -> 404            # passed the middleware; route not yet written
/assets/about-mKGDdw0w.js -> 200   # static assets served before middleware
/drizzle.svg -> 200
serverFn POST -> 403
unguarded serverFn POST -> 500     # same request with the middleware bypassing /_serverFn
```

Bundled migrate script against a fresh `postgres:16`:

```
[migrate] applying migrations from /private/tmp/claude-501/mig/drizzle
[migrate] done
exit=0
[migrate] applying migrations from /private/tmp/claude-501/mig/drizzle
[migrate] done
exit=0
saved_chunks rows: 0, drizzle.__drizzle_migrations rows: 1   # second run was a no-op
bad-url exit=1
[migrate] DATABASE_URL is not set
no-url exit=1
```

Compose smoke test (`docker compose up --build`, no seed mount):

```
chunker running 0
migrate exited 0
postgres running 0
web running 0
migrate-1  | [migrate] applying migrations from /app/drizzle
migrate-1  | [migrate] done
healthz: {"status":"ok"}
home: 200
/v1/meta: {..., "seed_entries":153}
export: 200
POST /v1/chunk "I miss you" -> [('extrañar', {'label': 'high', 'signals': {'seed': True, ...}})]
```

In the browser (Chrome, `localhost:3000`): "I miss you" showed _extrañar_ as "verified"; Save added it; `/saved` listed it (`extrañar · neutral · Te extraño. · high`); TXT export returned `extrañar — Te extraño. — neutral`. The test row was deleted afterwards.

Web image under a simulated Fly environment:

```
# FLY_APP_NAME=trozo-web, no Access values
/ -> 503
/healthz -> 200
/api/export?format=csv -> 503
/_serverFn/x -> 503
body: Cloudflare Access is not configured: set CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD
[access] 503 GET /: Cloudflare Access is not configured: set CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD

# FLY_APP_NAME=trozo-web, CF_ACCESS_TEAM_DOMAIN=trozo.cloudflareaccess.com, CF_ACCESS_AUD=abc
[no header] / -> 403
[cf-access-jwt-assertion: bogus] / -> 403
/healthz -> 200
[access] 403 GET /: missing Access token
[access] 403 GET /: invalid Access token
```
