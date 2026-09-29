# Spec: Deploy Readiness

| Field   | Value      |
| ------- | ---------- |
| id      | 006        |
| status  | approved   |
| created | 2026-09-29 |

---

## Why <!-- required -->

Both services run today only in Docker Compose on a trusted local network, and the code assumes it:

- **Nothing guards the web app.** There is no auth (OVERVIEW non-goal). Cloudflare Access will sit in front of the custom domain (008), but Fly also serves every app on a public `*.fly.dev` hostname. Anyone who finds that hostname could spend LLM credit and read or delete saved chunks.
- **Migrations can't run where Fly runs them.** Fly's `release_command` runs in the image being deployed. The web runtime image ships only `.output`, and Compose's `migrate` service borrows the _build_ stage for drizzle-kit.
- **The chunker image has no seed.** Compose mounts `evals/seed` into the container. A Fly machine has no such mount, so the seed index would be silently empty and no chunk would ever get the `high` ("verified") label in fast mode.
- **No web health check exists**, and the database connection has no settings for a remote, TLS-only, scale-to-zero Postgres (Neon).
- **No list of production config exists.** It is spread across the Procfile, Compose and code.

006 exists so that 007 and 008 are pure infrastructure work: when they start, the images and code already run correctly and safely on Fly and Neon.

### Consumer Impact <!-- required -->

- **The author, as operator:** can deploy both images to Fly without changing code. The deploy doc lists every env var and secret per app. Migrations run with one command from the image being deployed.
- **The author, as single user:** nothing visible changes locally. In production, the app answers only requests that came through Cloudflare Access, and seed-verified labels work as they do locally.
- **Integration points:**
  - Fly's HTTP health check calls the web app's `GET /healthz` and the chunker's existing `GET /v1/health`.
  - Fly's `release_command` (008) calls the migrate script.
  - Cloudflare Access (008) supplies the team domain and application audience (AUD) the web app verifies against.
  - `GET /v1/meta` reports how many seed entries were loaded, so a deploy can confirm the seed is present.

### Roadmap Fit <!-- required -->

- First of the production items (006–009). It depends on 004, the Postgres schema and migrations it makes runnable.
- **007** (chunker on Fly) needs the chunker image with the seed baked in, and the unchanged `/v1/health`.
- **008** (web on Fly) needs the Access check, `/healthz`, the migrate script as `release_command`, and the Neon connection settings.
- **009** (CI/CD) reuses the migrate script and the secrets inventory for preview apps.

---

## What <!-- required -->

### Acceptance Criteria <!-- required -->

Access check, written as the author:

- [ ] When Access is configured (`CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD`), every request to the web app's server is rejected with 403, unless it has a valid `Cf-Access-Jwt-Assertion` header. That covers pages, server functions and server routes (`/api/export`). A valid header is signed by the team's Access keys, with the configured audience and the team issuer, and is not expired.
- [ ] `GET /healthz` is never subject to the check.
- [ ] On Fly (`FLY_APP_NAME` set) with Access not configured, the app fails closed: every request except `/healthz` returns 503 with a message naming the missing variables. It never serves unauthenticated.
- [ ] Off Fly with Access not configured (`pnpm dev`, `pnpm dev:all`, `docker compose up`), there is no check, and local workflows need no new setup.
- [ ] Rejections and the fail-closed state are logged server-side, without logging the token.

Migrations, written as the operator:

- [ ] The web runtime image contains a self-contained migrate script and the committed `drizzle/` migrations. `node migrate.mjs` applies pending migrations to `DATABASE_URL` and exits 0, and exits non-zero on failure. It has no drizzle-kit and no `node_modules` install.
- [ ] Running it twice is a no-op the second time. It records migrations in the same journal table drizzle-kit uses, so local `pnpm db:migrate` and the image stay interchangeable.
- [ ] Compose's `migrate` service runs the runtime image's script, not the build stage.

Health and database:

- [ ] `GET /healthz` returns 200 without touching Postgres or the chunk service, so Fly's checks never wake a scaled-to-zero Neon compute.
- [ ] The web app connects to Neon's pooled connection string over TLS (`sslmode=verify-full` in `DATABASE_URL`). It uses the same node-postgres and Drizzle code as local dev and tests. A connection timeout makes a stuck connection fail with an error instead of hanging a request.

Chunker image:

- [ ] The chunker image contains `seed_v1.yaml`, and `CHUNKER_SEED_PATH` points to it by default. A container started with no mounts and no seed env var loads the full seed.
- [ ] `GET /v1/meta` includes the number of loaded seed entries.
- [ ] Compose no longer mounts `evals/seed`, so `docker compose up` exercises the baked seed like production.

Config inventory:

- [ ] `docs/DEPLOY.md` lists, per app (web and chunker), every env var: whether it is a Fly secret or plain config, its production value or source, and what reads it. It also records the chosen regions (Neon `aws-eu-central-1`, Fly `fra`).

Engineering:

- [ ] The web Vitest suite, the chunker pytest suite and ESLint and Prettier pass.
- [ ] Both images build from the repo root, and `docker compose up` works end to end, with the translator, save, `/saved` and export all working.

### Non-Goals <!-- required -->

- **No Fly apps, `fly.toml`, volumes or machines.** Those are 007 and 008.
- **No Cloudflare DNS or Access application setup** (008). 006 only reads the values Access will provide.
- **No CI, preview apps or spend limits** (009).
- **No app-level auth, sessions or users** (OVERVIEW non-goal). The Access JWT is only checked, never used to identify a user or fill `user_id`.
- **No change to the chunk service's own auth.** `CHUNKER_TOKEN` stays opt-in in code. Requiring it in production is config (007).
- **No database readiness check** in `/healthz`.
- **No switch to a serverless Postgres driver.** node-postgres stays (ROADMAP).

### Open Questions <!-- optional -->

- **Static assets and the Access check.** If Nitro serves `.output/public` (JS and CSS bundles) before Start's request middleware runs, those files would be reachable without a JWT on the `*.fly.dev` hostname. They contain no data or keys, so this is acceptable. The decision record states which way it went. **Deferred to implementation**, where it is checked directly.

---

## How <!-- required -->

### Approach <!-- required -->

1. **Access check** (`apps/web`). Load the TanStack Start `middleware` and `execution-model` skills first.
   - **`src/server/access.server.ts`: pure logic, easy to test.**
     - `accessConfig(env)` returns one of three states: `off`, `misconfigured` (on Fly with values missing) or `on` (with team domain and audience).
     - `verifyAccessJwt(token, config, jwks)` uses `jose`'s `jwtVerify`, with issuer `https://<team domain>` and the configured audience.
     - The key set is `createRemoteJWKSet` on `https://<team domain>/cdn-cgi/access/certs`, created once per process. `jose` caches and rotates keys.
   - **`src/start.ts`: global request middleware** (`createStart` with `requestMiddleware`).
     - It lets `/healthz` through.
     - When the state is `misconfigured`, it returns 503.
     - When it is `on`, it reads `Cf-Access-Jwt-Assertion` and returns 403 on a missing or invalid token.
     - Otherwise it calls `next()`.
   - `CF_ACCESS_TEAM_DOMAIN` is the full team domain (for example `trozo.cloudflareaccess.com`), so no URL is assembled from partial pieces.
2. **Health route:** `src/routes/healthz.ts`, a server route whose `GET` returns `{ status: "ok" }` with no imports from `db` or the chunker client.
3. **Database connection** (`src/db/index.ts`): switch to `drizzle({ connection: { connectionString, connectionTimeoutMillis: 10_000 }, schema })`. Neon's TLS comes from `sslmode=verify-full` in the URL, with no code branch for production.
4. **Migrate script:**
   - `src/db/migrate.ts` calls `migrate(db, { migrationsFolder })` from `drizzle-orm/node-postgres/migrator`, then closes the pool.
   - It resolves `migrationsFolder` next to the script. It logs start and finish, and exits non-zero on error.
   - In the Dockerfile build stage, esbuild bundles it into a single `migrate.mjs` (`--platform=node --format=esm`, with `pg-native` external).
   - The runtime stage copies `migrate.mjs` and `drizzle/` into `/app`.
   - Compose's `migrate` service builds the runtime target and runs `node migrate.mjs`.
5. **Chunker image and seed:**
   - The chunker's Docker build context moves to the repo root (`-f services/chunker/Dockerfile`), so the image can `COPY evals/seed/seed_v1.yaml`.
   - The Dockerfile sets `CHUNKER_SEED_PATH` to the baked file.
   - Compose's build context changes to match, and the seed volume is removed.
   - A root `.dockerignore` excludes `node_modules`, `.venv`, `.output`, `evals/results`, caches and `.env*`. This also shrinks the web build context.
6. **`/v1/meta`** gains `seed_entries: int`, the size of the loaded seed index. It is optional in the contract, and the schema package and TS types are regenerated.
7. **`docs/DEPLOY.md`:** the config and secrets inventory, the regions, and the migrate command. 007 and 008 add the Fly commands.
8. **Docs:**
   - ARCHITECTURE: the migrations open decision is resolved, Compose's `migrate` service is updated, and the Access middleware is added to the web component map.
   - README: a link to DEPLOY.md.

### Confidence <!-- required -->

**Level:** High, and Medium for the Access middleware's coverage.

**Rationale:**

- **Well understood:** the migrator, the health route, the pg connection options, the seed baking and the Compose changes are all small, local changes.
- **`jose` is standard for Access JWTs.** Cloudflare documents the certs URL, the issuer and the audience claim.
- **Uncertain:** whether Start's global request middleware wraps every request the server handles, including server functions, server routes and SSR pages. Static assets are the open question above. The installed Start version is `latest`, and its middleware API is recent.

**Validate before proceeding:**

- Before writing the rest, add the middleware with a stub that rejects everything. Run the production build (`vite build`, then `node .output/server/index.mjs`) and confirm each of these returns 403:
  - `GET /`;
  - a server function call;
  - `GET /api/export`.
- In the same run, confirm `/healthz` gets 200, and record what happens to a `/assets/*` file.
- If server functions or routes bypass the middleware, fall back to a Nitro server middleware before the Start handler, and record the switch.
- Bundle `migrate.mjs` and run it against the Compose Postgres once, before touching the Dockerfile.

### Key Decisions <!-- optional -->

- **Fail closed on Fly, open off Fly.** Fly always sets `FLY_APP_NAME`, so production can't run unprotected by accident, and local workflows need no new setup (discussed with the author). An explicit `REQUIRE_ACCESS` flag was rejected, because forgetting it leaves production open.
- **drizzle-orm migrator, bundled, not drizzle-kit in the image** (discussed with the author). The runtime image stays slim and contains no dev tooling. It uses the same migrations folder and journal table as drizzle-kit.
- **Liveness only in `/healthz`.** A DB ping every health interval would keep the Neon compute awake at all times and bill it continuously. A broken database shows up as failing requests and in logs instead.
- **Bake the seed into the image rather than mounting a volume.** The seed is versioned code input, and it changes only with a commit. The chunker's Fly volume (007) stays for the response cache only.
- **Header-only JWT.** The web app verifies `Cf-Access-Jwt-Assertion`, which Access adds on every proxied request. It ignores the `CF_Authorization` cookie, as Cloudflare recommends.

### Testing Approach <!-- required -->

- **Web unit tests** (Vitest):
  - `accessConfig`: off (no values, not on Fly), misconfigured (on Fly, missing one or both values), on.
  - `verifyAccessJwt` against a local key set (`jose` `generateKeyPair` and `createLocalJWKSet`). It accepts a valid token. It rejects each of these: a wrong audience, a wrong issuer, an expired token, a token signed by another key, a malformed token, and a missing token.
  - Middleware decision function: `/healthz` always passes; misconfigured returns 503; on without a header returns 403; on with a valid header passes; off passes.
- **Migrate script:** an integration test, or a checked manual step against Compose Postgres: a fresh database gets `saved_chunks`, a second run is a no-op, and a bad URL exits non-zero.
- **Chunker tests** (pytest): `/v1/meta` returns `seed_entries`, above 0 with the repo seed and 0 with no seed.
- **Image smoke test** (manual, recorded in the decision record):
  - `docker compose up --build`: the migrate service exits 0; `/healthz` returns 200; the chunker's `/v1/meta` shows the full seed with no mount; a seed phrase shows a "verified" chunk in the UI; save, `/saved` and export work.
  - With `FLY_APP_NAME=x` set on the web container: `/` returns 503 and `/healthz` returns 200.
- **Existing suites** stay green: web Vitest, chunker pytest, ESLint and Prettier.
