# Deploying trozo

Production target (roadmap 006–009): both services on **Fly.io**, Postgres on **Neon**, and the custom domain **trozoapp.com** on **Cloudflare** behind **Cloudflare Access**. This page is the config and secrets inventory. 007 and 008 add the Fly commands as the apps are created.

| Piece    | Where                                     | Region                                    |
| -------- | ----------------------------------------- | ----------------------------------------- |
| Postgres | Neon project, `main` branch, db `trozo`   | `aws-eu-central-1` (Frankfurt)            |
| Web      | Fly app (public, behind Access)           | `fra`                                     |
| Chunker  | Fly app (no public IP, Flycast only)      | `fra`, single machine with a cache volume |
| Domain   | `trozoapp.com`, Cloudflare DNS and Access | —                                         |

## Images

Both images build from the repo root:

```bash
docker build -f apps/web/Dockerfile .
docker build -f services/chunker/Dockerfile .
```

- **Web** runs `node .output/server/index.mjs` on port 3000. It also contains `migrate.mjs` and `drizzle/`: `node migrate.mjs` applies pending migrations to `DATABASE_URL` and exits (non-zero on failure). That is the web app's Fly `release_command` (008) and Compose's `migrate` service.
- **Chunker** runs uvicorn on port 8000 and bakes in `evals/seed/seed_v1.yaml`. `GET /v1/meta` reports `seed_entries`; after a deploy it must be above 0 (153 for seed v1), or no chunk can be "verified".

## Health checks

| App     | Path         | Notes                                                                                       |
| ------- | ------------ | ------------------------------------------------------------------------------------------- |
| Web     | `/healthz`   | Liveness only; never touches Postgres, so checks don't keep Neon awake. Exempt from Access. |
| Chunker | `/v1/health` | Liveness only; never requires `CHUNKER_TOKEN`.                                              |

## Web app

| Variable                | Kind       | Production value                                                                              | Read by                                              |
| ----------------------- | ---------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `DATABASE_URL`          | Fly secret | Neon **pooled** connection string (host contains `-pooler`), ending in `?sslmode=verify-full` | `src/db/index.ts`, `migrate.mjs`                     |
| `CHUNKER_URL`           | config     | The chunker's Flycast address (007), e.g. `http://trozo-chunker.flycast`                      | `src/lib/chunker.server.ts`                          |
| `CHUNKER_TOKEN`         | Fly secret | Random string (e.g. `openssl rand -hex 32`); same value as the chunker's                      | `src/lib/chunker.server.ts`                          |
| `CF_ACCESS_TEAM_DOMAIN` | config     | Full team domain, e.g. `<team>.cloudflareaccess.com` (008)                                    | `src/server/access.server.ts`                        |
| `CF_ACCESS_AUD`         | Fly secret | The Access application's audience (AUD) tag (008)                                             | `src/server/access.server.ts`                        |
| `PORT`                  | image      | `3000`                                                                                        | Nitro server                                         |
| `FLY_APP_NAME`          | set by Fly | —                                                                                             | `src/server/access.server.ts` (turns on fail-closed) |

**Access check.** When `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` are both set, every server request (pages, server functions, `/api/export`) needs a valid `Cf-Access-Jwt-Assertion` header, or gets 403. On Fly with either value missing, every request except `/healthz` gets 503 naming the missing variable, so the app never serves unauthenticated on its public `*.fly.dev` hostname. Off Fly (local dev, Compose) with neither set, there is no check. Static assets (`/assets/*`, files from `public/`) are served before the check. They hold no data or keys.

## Chunker

| Variable                 | Kind       | Production value            | Notes                                                           |
| ------------------------ | ---------- | --------------------------- | --------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`      | Fly secret | Anthropic key               | Primary model.                                                  |
| `OPENAI_API_KEY`         | Fly secret | OpenAI key                  | Verifier; unset means full mode uses consistency only.          |
| `CHUNKER_TOKEN`          | Fly secret | Same value as the web app's | Required on Fly: without it `POST /v1/chunk` returns 503 (007). |
| `CHUNKER_SEED_PATH`      | image      | `/app/seed/seed_v1.yaml`    | Baked in; don't override.                                       |
| `CHUNKER_CACHE_DIR`      | image      | `/app/.cache/chunker`       | Mount the Fly volume at `/app/.cache` (007).                    |
| `CHUNKER_VERIFIER_MODEL` | default    | `gpt-5.4-mini`              | Code default; set only to change it.                            |
| `CHUNKER_PRIMARY_MODEL`  | default    | `claude-sonnet-5`           | Code default.                                                   |
| `CHUNKER_EFFORT`         | default    | `medium`                    | Code default.                                                   |
| `CHUNKER_PROMPT_VERSION` | default    | `p1`                        | Code default.                                                   |
| `CHUNKER_SAMPLE_PERTURB` | unset      | —                           | Off in production.                                              |
| `FLY_APP_NAME`           | set by Fly | —                           | Turns on the token guard's fail-closed check.                   |

### Deploying the chunker (007)

Fly app `trozo-chunker` in the `personal` org, config in `services/chunker/fly.toml`. **Always run flyctl from the repo root and pass the app** (`-a trozo-chunker` or `--config`): the build context must include `evals/seed`, and the repo root has no `fly.toml` for flyctl to find.

One-time setup (done 2026-09-29):

```bash
fly apps create trozo-chunker --org personal
fly volumes create chunker_cache --app trozo-chunker --region fra --size 1
# Secrets are staged, so the first deploy carries them. CHUNKER_TOKEN is shared with the web app (008).
fly secrets set --stage -a trozo-chunker CHUNKER_TOKEN="$(openssl rand -hex 32)"
fly secrets set --stage -a trozo-chunker \
  ANTHROPIC_API_KEY="$(grep '^ANTHROPIC_KEY=' .env.local | cut -d= -f2-)" \
  OPENAI_API_KEY="$(grep '^OPENAI_API_KEY=' .env.local | cut -d= -f2-)"
fly deploy . --config services/chunker/fly.toml --no-public-ips --ha=false
fly ips allocate-v6 --private -a trozo-chunker   # Flycast: http://trozo-chunker.flycast
```

Every later deploy:

```bash
fly deploy . --config services/chunker/fly.toml --ha=false
```

After deploying, `fly ips list -a trozo-chunker` must show only the `private ingress` address. **Never run `fly ips allocate-v4` / `allocate-v6` without `--private`** on this app: a public IP would expose the chunk endpoint (and LLM credit) to the internet, guarded only by the token.

**Smoke test** (no public endpoint, so test from inside the org): `fly ssh console -a trozo-chunker`, then call `http://trozo-chunker.flycast` (Python's `urllib` is in the image; there's no curl). Expect `/v1/health` 200, `/v1/meta` with `seed_entries` 153, and `POST /v1/chunk` 401 without the token and 200 with it. From a laptop, `fly proxy 8080:80 trozo-chunker.flycast -a trozo-chunker` forwards through the same Fly proxy.

**Single machine.** The cache volume belongs to one machine, so the app runs exactly one (`--ha=false`). Don't `fly scale count` above 1: a second machine would need its own volume and would start with an empty cache.

**Idle behaviour.** `auto_stop_machines = "suspend"` with `min_machines_running = 0`: the machine suspends when idle (about 8 minutes after the last request) and the next Flycast request resumes it in about 0.9 s. Health checks don't keep it awake. A machine that was _stopped_ (e.g. after `fly machine stop` or a host event) takes about 11 s to boot and import spaCy; Fly's proxy holds the request meanwhile.

**Size.** shared-cpu-1x, 512 MB. Measured peak RSS was about 260 MB (uvicorn worker 239 MB plus the `uv` wrapper 21 MB) across fast and full-confidence requests.

## Never in the repo

Secrets live only as Fly secrets (and locally in `.env.local`, which is git-ignored, as is every `.env.*` except `.env.example`). The Docker build context excludes `.env*` (`.dockerignore`).
