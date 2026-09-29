# Deploying trozo

Production (live since 2026-09-29, roadmap 006–008): both services on **Fly.io**, Postgres on **Neon**, and **https://trozoapp.com** on **Cloudflare** behind **Cloudflare Access** (only `adrian@thesolo.dev` can sign in). This page is the config and secrets inventory, the deploy commands, and the Cloudflare checklist. 009 automates the deploys.

| Piece    | Where                                                     | Region                                    |
| -------- | --------------------------------------------------------- | ----------------------------------------- |
| Postgres | Neon project, `main` branch, db `neondb`, pooled endpoint | `aws-eu-central-1` (Frankfurt)            |
| Web      | Fly app `trozo-web` (public IPs, behind Access)           | `fra`, single machine                     |
| Chunker  | Fly app `trozo-chunker` (no public IP, Flycast only)      | `fra`, single machine with a cache volume |
| Domain   | `trozoapp.com`, registered at Cloudflare; DNS and Access  | —                                         |
| Access   | Zero Trust team `round-cake-32d9`, application `trozo`    | —                                         |

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
| `CHUNKER_URL`           | `fly.toml` | `http://trozo-chunker.flycast`                                                                | `src/lib/chunker.server.ts`                          |
| `CHUNKER_TOKEN`         | Fly secret | Random string (e.g. `openssl rand -hex 32`); same value as the chunker's                      | `src/lib/chunker.server.ts`                          |
| `CF_ACCESS_TEAM_DOMAIN` | `fly.toml` | `round-cake-32d9.cloudflareaccess.com`                                                        | `src/server/access.server.ts`                        |
| `CF_ACCESS_AUD`         | Fly secret | The Access application's audience (AUD) tag                                                   | `src/server/access.server.ts`                        |
| `PORT`                  | image      | `3000`                                                                                        | Nitro server                                         |
| `FLY_APP_NAME`          | set by Fly | —                                                                                             | `src/server/access.server.ts` (turns on fail-closed) |

**Access check.** When `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` are both set, every server request (pages, server functions, `/api/export`) needs a valid `Cf-Access-Jwt-Assertion` header, or gets 403. On Fly with either value missing, every request except `/healthz` gets 503 naming the missing variable, so the app never serves unauthenticated on its public `*.fly.dev` hostname. Off Fly (local dev, Compose) with neither set, there is no check. Static assets (`/assets/*`, files from `public/`) are served before the check. They hold no data or keys.

**Neon URL shape.** Use the pooled string from the Neon console with `sslmode=verify-full` in place of `sslmode=require` (TLS 1.3 with a verified `*.eu-central-1.aws.neon.tech` certificate; Neon refuses plaintext). Neon's `channel_binding=require` also works with node-postgres and may be kept or dropped. Locally the URL lives in the git-ignored `.env.production`; never paste it into a command.

### Deploying the web app (008)

Fly app `trozo-web` in the `personal` org, config in `apps/web/fly.toml`. Run flyctl from the repo root, as for the chunker.

One-time setup (done 2026-09-29):

```bash
fly apps create trozo-web --org personal
# CHUNKER_TOKEN must equal the chunker's (compare digests in `fly secrets list` for both apps).
fly secrets set --stage -a trozo-web CHUNKER_TOKEN=<chunker's token> \
  DATABASE_URL="$(grep '^DATABASE_URL=' .env.production | cut -d= -f2-)"
fly deploy . --config apps/web/fly.toml --ha=false      # allocates a shared IPv4 and a dedicated IPv6
fly certs add trozoapp.com -a trozo-web
fly certs setup trozoapp.com -a trozo-web                # prints the _acme-challenge and _fly-ownership records
# ...Cloudflare checklist below, then:
fly secrets set --stage -a trozo-web CF_ACCESS_AUD=<AUD tag>
fly deploy . --config apps/web/fly.toml --ha=false
```

Every later deploy:

```bash
fly deploy . --config apps/web/fly.toml --ha=false
```

Each deploy first runs `node migrate.mjs` on a one-off release machine against Neon; `[migrate] done` in `fly logs -a trozo-web` confirms it, and a failed migration aborts the deploy with the previous release still serving. Until `CF_ACCESS_AUD` and `CF_ACCESS_TEAM_DOMAIN` are both set, the app returns 503 for everything but `/healthz`, so it is never open.

**Protection check** after any deploy: `https://trozo-web.fly.dev/` must return 403 and `/healthz` 200; `https://trozoapp.com/` without a session must redirect (302) to `round-cake-32d9.cloudflareaccess.com`.

**Idle behaviour and size.** Suspends when idle, like the chunker; health checks don't keep it awake. shared-cpu-1x, 256 MB: measured peak RSS was about 101 MB after SSR, saving, `/saved` and all three exports. A cold boot (stopped machine) takes about 2 s to `Listening on :3000`.

## Cloudflare (008)

`trozoapp.com` is registered at Cloudflare, so the zone already uses Cloudflare's nameservers. Settings, in the order they were applied:

1. **DNS** (zone `trozoapp.com` → DNS → Records):

   | Type  | Name              | Content                             | Proxy           |
   | ----- | ----------------- | ----------------------------------- | --------------- |
   | A     | `@`               | `66.241.124.134` (Fly shared IPv4)  | Proxied         |
   | AAAA  | `@`               | `2a09:8280:1::19f:f704:0` (Fly v6)  | Proxied         |
   | AAAA  | `www`             | `100::` (placeholder; see redirect) | Proxied         |
   | CNAME | `_acme-challenge` | `trozoapp.com.e5d5xrj.flydns.net`   | DNS only (grey) |
   | TXT   | `_fly-ownership`  | `app-e5d5xrj`                       | —               |

   The `_acme-challenge` CNAME lets Fly issue its certificate by DNS validation while Cloudflare's proxy is in front; `_fly-ownership` proves the domain to Fly behind a proxy. If `fly ips list -a trozo-web` ever changes, update the A/AAAA records (`fly certs setup trozoapp.com -a trozo-web` prints the current values).

2. **Certificate:** wait for `fly certs check trozoapp.com -a trozo-web` to show `Issued` **before** step 3.
3. **SSL/TLS:** encryption mode **Full (strict)**; Edge Certificates → **Always Use HTTPS** on.
4. **Redirect** (Rules → Redirect Rules): hostname equals `www.trozoapp.com` → dynamic `concat("https://trozoapp.com", http.request.uri.path)`, 301, preserve query string. It runs before Access, so `www` visitors are redirected first and log in on the apex.
5. **Access** (Zero Trust, Free plan, team `round-cake-32d9`) → Access → Applications → Self-hosted `trozo`:
   - public hostnames `trozoapp.com` and `www.trozoapp.com`;
   - session duration 1 month;
   - policy `author`: Allow, include Emails `adrian@thesolo.dev`;
   - login method One-time PIN.

   Copy the application's **AUD tag** into the `CF_ACCESS_AUD` Fly secret. A new Access application means a new AUD: update the secret, or every request returns 403.

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
