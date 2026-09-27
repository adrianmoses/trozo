# Roadmap

<!-- status: draft | approved -->

| Field   | Value      |
| ------- | ---------- |
| status  | approved   |
| created | 2026-09-23 |

## Features

Ordering follows the spec's milestones: build the evals alongside the service, not after it — the first 30 seed items come before the first UI.

| ID  | Feature                                                                                                                                                                           | Status      | Spec                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------- |
| 000 | Monorepo restructure (move app to `apps/web`, scaffold `services/chunker`, `evals/`, `packages/schema`, Docker Compose)                                                           | implemented | [spec](000-monorepo-restructure/spec.md) |
| 001 | Seed v0 + chunk service (30 seed items; `POST /v1/chunk` returns valid JSON; eval runner prints chunk recall and calque rate)                                                     | implemented | [spec](001-seed-chunk-service/spec.md)   |
| 002 | Translator UI (input bar, full translation, watch-out box, chunk cards, notes, copy; `fast` confidence from seed)                                                                 | implemented | [spec](002-translator-ui/spec.md)        |
| 003 | Full confidence (self-consistency + verifier wired; thresholds tuned on `dev` split)                                                                                              | implemented | [spec](003-full-confidence/spec.md)      |
| 004 | Saving + export (Postgres `saved_chunks`, `/saved` route, Anki CSV and TXT export)                                                                                                | implemented | [spec](004-saving-export/spec.md)        |
| 005 | Seed to 120 + eval report (native-checked regional items; README with metrics table and before/after prompt comparison)                                                           | implemented | [spec](005-seed-eval-report/spec.md)     |
| 006 | Deploy readiness (Neon serverless driver for Drizzle, Cloudflare build preset for the web app, migrations as a release step, prod config and secrets inventory)                   | planned     | —                                        |
| 007 | Chunker on Cloudflare Containers (image with spaCy model, reachable only from the web Worker, service token required, response cache moved off local disk)                        | planned     | —                                        |
| 008 | Web on Cloudflare Workers + custom domain (DNS and TLS on Cloudflare, Neon production branch, secrets, Cloudflare Access in front of the whole site)                              | planned     | —                                        |
| 009 | CI/CD and operations (GitHub Actions: tests on PRs, deploy on merge to main with migrations first; preview deploys on a Neon branch; logs, `meta.dropped` rate, LLM spend limits) | planned     | —                                        |

## Production deployment (006–009)

Target: a custom domain, **Neon** for Postgres, **Cloudflare** for hosting. The items run in order: 006 makes the code deployable, 007 and 008 stand up the two services, and 009 automates it. Each gets its own spec. OVERVIEW and ARCHITECTURE already describe this target topology as planned.

Constraints each spec must settle:

- **The chunker is Python with spaCy,** so it can't run as a plain Worker. Plan: Cloudflare Containers behind a Worker, called by the web app through a service binding rather than the public internet. Validate image size, memory, and cold start with the spaCy model before 007 is built.
- **Node `pg` doesn't run on Workers.** Plan: Drizzle over `@neondatabase/serverless` (or `pg` through Hyperdrive), chosen in 006. Keep node-postgres for local dev and tests.
- **No auth in v1.** A public URL would let anyone spend LLM credit and read or delete saved chunks. Plan: Cloudflare Access on the whole domain (single user). App-level auth stays out of scope (OVERVIEW non-goal).
- **Container disk is not durable.** The response cache, which evals and relabel-on-read rely on, moves to R2 or KV, or is scoped to eval runs only. Decided in 007.
- **Secrets:** `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `CHUNKER_TOKEN` and `DATABASE_URL` live as Worker/Container secrets, never in the repo. Provider-side spend limits are set in 009.

## Status Values

- `planned` — not yet started
- `in-progress` — spec written, implementation underway
- `implemented` — decision record complete
- `deprecated` — removed from product

## Revision History

| Date       | Change                                                                |
| ---------- | --------------------------------------------------------------------- |
| 2026-09-23 | Initial roadmap created                                               |
| 2026-09-23 | 000 implemented (decision record complete)                            |
| 2026-09-24 | 001 implemented (decision record complete)                            |
| 2026-09-24 | 002 spec drafted, status in-progress                                  |
| 2026-09-25 | 002 implemented (decision record complete)                            |
| 2026-09-25 | 003 spec drafted, status in-progress                                  |
| 2026-09-25 | 003 implemented (decision record complete)                            |
| 2026-09-25 | Docs refresh after 003 (README, ARCHITECTURE, OVERVIEW)               |
| 2026-09-26 | 004 spec drafted, status in-progress                                  |
| 2026-09-26 | 004 implemented (decision record complete)                            |
| 2026-09-26 | 005 spec drafted, status in-progress                                  |
| 2026-09-27 | 005 implemented (decision record complete)                            |
| 2026-09-27 | Added 006–009: production deployment on Cloudflare with Neon Postgres |
