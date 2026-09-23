# Roadmap

<!-- status: draft | approved -->

| Field   | Value      |
| ------- | ---------- |
| status  | approved   |
| created | 2026-09-23 |

## Features

Ordering follows the spec's milestones: build the evals alongside the service, not after it — the first 30 seed items come before the first UI.

| ID  | Feature                                                                                                                       | Status      | Spec                                     |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------- |
| 000 | Monorepo restructure (move app to `apps/web`, scaffold `services/chunker`, `evals/`, `packages/schema`, Docker Compose)       | implemented | [spec](000-monorepo-restructure/spec.md) |
| 001 | Seed v0 + chunk service (30 seed items; `POST /v1/chunk` returns valid JSON; eval runner prints chunk recall and calque rate) | planned     | —                                        |
| 002 | Translator UI (input bar, full translation, watch-out box, chunk cards, notes, copy; `fast` confidence from seed)             | planned     | —                                        |
| 003 | Full confidence (self-consistency + verifier wired; thresholds tuned on `dev` split)                                          | planned     | —                                        |
| 004 | Saving + export (Postgres `saved_chunks`, `/saved` route, Anki CSV and TXT export)                                            | planned     | —                                        |
| 005 | Seed to 120 + eval report (native-checked regional items; README with metrics table and before/after prompt comparison)       | planned     | —                                        |

## Status Values

- `planned` — not yet started
- `in-progress` — spec written, implementation underway
- `implemented` — decision record complete
- `deprecated` — removed from product

## Revision History

| Date       | Change                  |
| ---------- | ----------------------- |
| 2026-09-23 | Initial roadmap created |
| 2026-09-23 | 000 implemented (decision record complete) |
