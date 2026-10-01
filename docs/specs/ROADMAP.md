# Roadmap

<!-- status: draft | approved -->

| Field   | Value      |
| ------- | ---------- |
| status  | approved   |
| created | 2026-09-23 |

## Features

Ordering follows the spec's milestones: build the evals alongside the service, not after it — the first 30 seed items come before the first UI.

| ID  | Feature                                                                                                                                                                                    | Status      | Spec                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- | ---------------------------------------- |
| 000 | Monorepo restructure (move app to `apps/web`, scaffold `services/chunker`, `evals/`, `packages/schema`, Docker Compose)                                                                    | implemented | [spec](000-monorepo-restructure/spec.md) |
| 001 | Seed v0 + chunk service (30 seed items; `POST /v1/chunk` returns valid JSON; eval runner prints chunk recall and calque rate)                                                              | implemented | [spec](001-seed-chunk-service/spec.md)   |
| 002 | Translator UI (input bar, full translation, watch-out box, chunk cards, notes, copy; `fast` confidence from seed)                                                                          | implemented | [spec](002-translator-ui/spec.md)        |
| 003 | Full confidence (self-consistency + verifier wired; thresholds tuned on `dev` split)                                                                                                       | implemented | [spec](003-full-confidence/spec.md)      |
| 004 | Saving + export (Postgres `saved_chunks`, `/saved` route, Anki CSV and TXT export)                                                                                                         | implemented | [spec](004-saving-export/spec.md)        |
| 005 | Seed to 120 + eval report (native-checked regional items; README with metrics table and before/after prompt comparison)                                                                    | implemented | [spec](005-seed-eval-report/spec.md)     |
| 006 | Deploy readiness (Access JWT check in the web app, migrations runnable from the runtime image, Neon pooled connection for node-postgres, health checks, prod config and secrets inventory) | implemented | [spec](006-deploy-readiness/spec.md)     |
| 007 | Chunker on Fly.io (private app with no public IP, reached over Flycast with the service token, volume for the response cache, VM size and cold start with the spaCy model)                 | implemented | [spec](007-chunker-fly/spec.md)          |
| 008 | Web on Fly.io + custom domain (Cloudflare DNS and TLS in front of Fly, Cloudflare Access on the whole site, Neon production branch, Fly secrets, migrations as `release_command`)          | implemented | [spec](008-web-fly-domain/spec.md)       |
| 009 | CI/CD and operations (GitHub Actions: tests on PRs, deploy on merge to main with migrations first; structured logs with the `meta.dropped` count, LLM spend limits)                        | in-progress | [spec](009-ci-ops/spec.md)               |
| 010 | Preview apps per PR (a Fly app per PR on its own Neon branch, torn down on close, behind Access; calls the shared production chunker)                                                      | planned     | —                                        |

## Production deployment (006–009)

Target: a custom domain, **Neon** for Postgres, **Fly.io** for hosting both services, and **Cloudflare** for DNS and Access. The items run in order: 006 makes the code deployable, 007 and 008 stand up the two services, and 009 automates it. Each gets its own spec. OVERVIEW and ARCHITECTURE already describe this target topology as planned.

Fly.io replaced an earlier Cloudflare Workers + Containers plan (2026-09-27): Workers would have meant swapping the Postgres driver, a Workers build preset, moving the disk cache to R2 or KV, and running a 474 MB spaCy image on the least mature product in the stack. On Fly both existing Docker images deploy unchanged.

Constraints each spec must settle:

- **No auth in v1.** A public URL would let anyone spend LLM credit and read or delete saved chunks. Plan: Cloudflare Access on the whole domain (single user). Fly also serves every app on a public `*.fly.dev` hostname, so the web app verifies the `Cf-Access-Jwt-Assertion` header (team domain and audience) on every request except its health check, built in 006. App-level auth stays out of scope (OVERVIEW non-goal).
- **The chunker is never public.** Plan: a Fly app with no public IP, reached by the web app over Flycast (so Fly can auto-start it) with `CHUNKER_TOKEN` required. Validate VM memory and cold start with the spaCy model in 007, and decide whether it auto-stops.
- **Migrations run from the runtime image.** Fly's `release_command` runs in the image being deployed, which ships only `.output` and has no drizzle-kit. Plan: a small migrate script using drizzle-orm's migrator, or ship drizzle-kit in the image; chosen in 006.
- **The response cache stays on disk.** Evals and relabel-on-read rely on it. Plan: a Fly volume mounted at `CHUNKER_CACHE_DIR`. A volume belongs to one machine, so the chunker runs as a single machine; 007 records that limit.
- **Postgres stays on node-postgres.** Plan: Neon's pooled connection string with TLS in production, the same Drizzle code as local dev and tests. Put the Fly region next to the Neon region.
- **Previews behave like production.** Moved from 009 to 010 (2026-09-30): a Fly app per PR with its own Neon branch, destroyed when the PR closes, calling the shared production chunker (decided in 009's discovery). Still open: how previews sit behind Access (a hostname per preview on the custom domain with a wildcard Access application, or another route), since `*.fly.dev` can't go through Access.
- **Secrets:** `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `CHUNKER_TOKEN`, `DATABASE_URL` and the Access audience live as Fly secrets, never in the repo. Provider-side spend limits are set in 009.

## Status Values

- `planned` — not yet started
- `in-progress` — spec written, implementation underway
- `implemented` — decision record complete
- `deprecated` — removed from product

## Revision History

| Date       | Change                                                                          |
| ---------- | ------------------------------------------------------------------------------- |
| 2026-09-23 | Initial roadmap created                                                         |
| 2026-09-23 | 000 implemented (decision record complete)                                      |
| 2026-09-24 | 001 implemented (decision record complete)                                      |
| 2026-09-24 | 002 spec drafted, status in-progress                                            |
| 2026-09-25 | 002 implemented (decision record complete)                                      |
| 2026-09-25 | 003 spec drafted, status in-progress                                            |
| 2026-09-25 | 003 implemented (decision record complete)                                      |
| 2026-09-25 | Docs refresh after 003 (README, ARCHITECTURE, OVERVIEW)                         |
| 2026-09-26 | 004 spec drafted, status in-progress                                            |
| 2026-09-26 | 004 implemented (decision record complete)                                      |
| 2026-09-26 | 005 spec drafted, status in-progress                                            |
| 2026-09-27 | 005 implemented (decision record complete)                                      |
| 2026-09-27 | Added 006–009: production deployment on Cloudflare with Neon Postgres           |
| 2026-09-27 | 006–009 revised: Fly.io hosts both services; Cloudflare for DNS and Access only |
| 2026-09-29 | 006 spec drafted, status in-progress                                            |
| 2026-09-29 | 006 implemented (decision record complete)                                      |
| 2026-09-29 | 007 spec drafted, status in-progress                                            |
| 2026-09-29 | 007 implemented (decision record complete)                                      |
| 2026-09-29 | 008 spec drafted, status in-progress                                            |
| 2026-09-29 | 008 implemented (decision record complete); production live at trozoapp.com     |
| 2026-09-30 | 009 spec drafted, status in-progress; previews split out as 010                 |
