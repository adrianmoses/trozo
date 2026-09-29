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

| Variable                 | Kind       | Production value            | Notes                                                          |
| ------------------------ | ---------- | --------------------------- | -------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`      | Fly secret | Anthropic key               | Primary model.                                                 |
| `OPENAI_API_KEY`         | Fly secret | OpenAI key                  | Verifier; unset means full mode uses consistency only.         |
| `CHUNKER_TOKEN`          | Fly secret | Same value as the web app's | Required in production: the chunk endpoint is open without it. |
| `CHUNKER_SEED_PATH`      | image      | `/app/seed/seed_v1.yaml`    | Baked in; don't override.                                      |
| `CHUNKER_CACHE_DIR`      | image      | `/app/.cache/chunker`       | Mount the Fly volume at `/app/.cache` (007).                   |
| `CHUNKER_VERIFIER_MODEL` | default    | `gpt-5.4-mini`              | Code default; set only to change it.                           |
| `CHUNKER_PRIMARY_MODEL`  | default    | `claude-sonnet-5`           | Code default.                                                  |
| `CHUNKER_EFFORT`         | default    | `medium`                    | Code default.                                                  |
| `CHUNKER_PROMPT_VERSION` | default    | `p1`                        | Code default.                                                  |
| `CHUNKER_SAMPLE_PERTURB` | unset      | —                           | Off in production.                                             |

## Never in the repo

Secrets live only as Fly secrets (and locally in `.env.local`, which is git-ignored, as is every `.env.*` except `.env.example`). The Docker build context excludes `.env*` (`.dockerignore`).
