# Decision Record: CI/CD and Operations

| Field   | Value                |
| ------- | -------------------- |
| id      | 009                  |
| status  | implemented          |
| created | 2026-10-01           |
| spec    | [spec.md](./spec.md) |

---

## Context <!-- required -->

Production had been live at https://trozoapp.com since 008, but deploys were manual `fly deploy` runs from the author's laptop, and nothing checked a commit before it shipped. The repo is public on GitHub and had no workflows.

**Previews.** 009 originally included preview apps per PR. Discovery split them out as 010: Fly's `*.fly.dev` hostnames can't sit behind Cloudflare Access, and a hostname per preview on `trozoapp.com` needs DNS records and a certificate for each preview. The decision that a preview calls the shared production chunker carried over to 010.

**Discovery also settled:**

- the CI gate, without image builds on PRs;
- the scope of the operations work: JSON logs to stdout, read with `fly logs`, and no log shipping.

**Who did what.** The agent wrote the workflows, logging, docs and checks. The author created the two Fly deploy tokens and stored them as GitHub secrets with `fly tokens create deploy … | gh secret set …`, so the values never appeared in the conversation. The author confirmed that both providers' monthly spend limits are at their 200 USD default, and merged the PRs.

**During implementation:**

- **Swap file.** The spec commit picked up a vim swap file (`.spec.md.swp`, from the author having the spec open). It was removed from the commit before the push, and `*.swp` was added to `.gitignore`.
- **First CI run failed.** The chunker job failed: pytest couldn't import `app` on a clean runner. Locally it had worked because of the local environment. Fixed with `pythonpath = ["."]` in the pytest config.
- **Duplicate CI run.** The merge of PR #16 started CI twice on the same commit, 9 seconds apart, both first attempts. GitHub appears to have delivered the push event twice. The concurrency group and change detection made the duplicate harmless (see Test Evidence).

## Decision <!-- required -->

Merging to `main` is now the normal path to production.

**CI** (`.github/workflows/ci.yml`) runs on PRs and pushes to `main`:

- Prettier, web ESLint, a new `typecheck` script (`tsc --noEmit`), and `pnpm test` (web and schema). The Postgres suite runs against a `postgres:16` service container, and it throws in CI if `TEST_DATABASE_URL` is missing, so it can't be skipped silently.
- Chunker pytest, with uv.
- No secrets, so PRs from forks run it.

**Deploy** (`.github/workflows/deploy.yml`) runs on `workflow_run` of a successful CI push to `main`, or by `workflow_dispatch`:

- **Change detection:** a `changes` job diffs the commit against the last successful _automatic_ deploy (found with `gh run list`). The chunker deploys if `services/chunker/` or `evals/seed/` changed; the web app if `apps/web/` or `packages/schema/` changed. With no earlier deploy, both deploy.
- **Chunker first:** the chunker deploys, then the job fails if `fly ips list` shows anything but `private_v6`. The web job runs only if the chunker deploy succeeded or was skipped.
- **Web:** the deploy runs `migrate.mjs` as its `release_command`, then a protection check: `trozo-web.fly.dev/` must return 403 and `/healthz` 200.
- **Mechanics:** each app has its own Fly deploy token (`FLY_DEPLOY_TOKEN_CHUNKER`, `FLY_DEPLOY_TOKEN_WEB`). Builds use Fly's remote builders. A `deploy-production` concurrency group means one deploy at a time.

**Logs.** Both services write one JSON object per line to stdout:

- **Chunker:** `chunk` for each `/v1/chunk` response (mode, region, prompt version, cache hit, latency, chunks, dropped count) and `chunk_error` for each error (status, code, exception type).
- **Web:** `chunker_call` for each call to the chunker, `access_denied` for each Access rejection, and `server_fn_error` and `request_error` for failures.
- **Never logged:** the input phrase, exception messages from the chunker (validation errors can echo the input), tokens and JWTs.

**Docs.** `docs/DEPLOY.md` documents CI/CD, the secrets and token rotation, rollback, the log fields, a dropped-rate one-liner, and the spend limits.

---

## Alternatives Considered <!-- required -->

### Previews in 009

**Option A:** a hostname per preview on the custom domain, with a wildcard Access application.

- Pros: the closest to production; the JWT check would work unchanged.
- Cons: a Cloudflare API token, DNS records and a Fly certificate per preview. It needed a spike of its own.

**Option B:** private previews reached with `fly proxy`.

- Pros: the simplest infrastructure.
- Cons: a preview-only bypass of the Access check.

**Option C:** split previews out to a later item.

**Chosen:** C, the author's choice. 009 stays about the production path. 010 inherits the Access question and the decision to call the shared chunker.

### How deploys are gated on tests

**Option A:** a deploy workflow on `push` that runs the tests again before deploying.

- Pros: one workflow.
- Cons: the tests run twice per merge, and two definitions of "tested" can drift apart.

**Option B:** `workflow_run` on CI completing, filtered to success on a `push` from this repo.

- Pros: a deploy can only follow a green CI run on the same commit.
- Cons: `workflow_run` has no push "before" SHA, so the deploy needs its own base for change detection.

**Chosen:** B.

### Base for change detection

**Option A:** `HEAD^`.

- Pros: simple.
- Cons: misses changes when a deploy failed or a queued run was replaced. A newer queued run in the same concurrency group cancels an older queued one.

**Option B:** the commit of the last successful automatic deploy.

- Pros: covers every change since production last moved, including failed and skipped runs.
- Cons: needs `actions: read` and `gh run list`. Manual runs must be excluded, since a chunker-only dispatch says nothing about the web app.

**Chosen:** B. It is what made the duplicate run harmless: it diffed against the first run and found nothing.

### Fly tokens

**Option A:** one org token.

- Pros: one secret.
- Cons: a leaked token could create apps, or add a public IP to the chunker.

**Option B:** a deploy token for each app.

**Chosen:** B. The worry was that an app-scoped token might not be able to run `fly deploy` with the remote builder, the release machine and `fly ips list`. The first automatic deploy showed it can.

### Logging to stdout or shipping logs

**Option A:** JSON on stdout, read with `fly logs`.

**Option B:** also ship logs to an external sink, with dashboards and alerts.

**Chosen:** A, the author's choice. No new service or secret. The cost is a short retention window (see Tradeoffs).

### Where web failures are logged

**Option A:** request middleware only.

- Cons: TanStack Start serializes server-function errors into an HTTP 200 (ARCHITECTURE), so the request middleware never sees them thrown.

**Option B:** request middleware for thrown request errors, plus global function middleware for server-function errors.

**Chosen:** B. Redirects and not-found errors are skipped as control flow. A production build without a database showed the function middleware logging the failed saved-chunks query.

### What a chunker error line contains

**Option A:** include the exception message.

- Cons: `RequestValidationError` and `InvalidInput` messages can contain the input.

**Option B:** status, code and exception type only.

**Chosen:** B. The HTTP response still carries the message to the web app, which logs only the status and code.

---

## Tradeoffs <!-- required -->

- **Short log retention.** `fly logs --no-tail` reads only Fly's recent buffer. The dropped rate measures recent traffic, not history, and cache hits replay their stored `dropped` count, so a repeated phrase counts again.
- **No rollback workflow.** Rolling back is `fly deploy --image` by hand, then a revert PR. Migrations only move forward, so the old code has to work with the new schema.
- **Stopped after deploy.** A deploy leaves the chunker machine _stopped_, not suspended, so the first translation after a deploy waits for a cold boot (about 11 s, from 007). Every later idle period suspends as before.
- **Change detection depends on paths.** A change elsewhere that affects an image wouldn't trigger a deploy. Examples: the root `pnpm-lock.yaml` or `package.json` for the web app, or a new top-level file the chunker image copies. The Deploy workflow's manual run covers it.
- **Cloudflare remains manual** dashboard state, as in 008.
- **Spend limits sit at the provider default** of 200 USD a month each. That is far above a single user's expected spend, so they guard against a runaway, not against creeping cost.

---

### Spec Divergence <!-- optional -->

| Spec Said                                                                           | What Was Built                                                                                                                                       | Reason                                                                                                                              |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Spike: a token-scoped deploy from the laptop before full implementation             | The first automatic deploy after merging was the spike                                                                                               | A laptop deploy of the branch would have put unreviewed code in production. The workflow failing closed made the merge a safe test. |
| "The author adds them as repository secrets. The agent never handles token values." | As specified. The author piped `fly tokens create deploy` straight into `gh secret set`                                                              | —                                                                                                                                   |
| "Errors are logged as JSON with the exception type"                                 | Also status and code. 401/503 from the token guard are included because they pass through the same handlers. Unexpected exceptions get a 500 handler | Each line says what failed without the message.                                                                                     |
| Web logs "per failed request (route, error message)"                                | Two events: `request_error` (request middleware) and `server_fn_error` (function middleware)                                                         | Server-function errors never reach the request middleware as thrown errors (see Alternatives).                                      |
| Access rejections logged                                                            | `accessDecision`'s logger now takes structured fields, not a string. The 006 tests were updated to match                                             | JSON lines are built from fields, which also makes "no token in the line" a direct assertion.                                       |
| A docs-only merge deploys nothing (testing approach)                                | Not yet observed on a docs-only merge. The duplicate run on an unchanged diff deployed nothing                                                       | The merge of this decision record (docs only) is the first docs-only merge. Its Deploy run should skip both jobs.                   |
| Testing: "a PR with a deliberately failing test shows a red check"                  | Not staged on purpose. PR #16's first CI run failed for real (chunker import error), and the PR showed a red check                                   | A real failure gave the same evidence.                                                                                              |
| Chunker `uv sync` and pytest "as locally"                                           | Needed `pythonpath = ["."]` in `pyproject.toml`                                                                                                      | Locally pytest found `app` through the local environment; a clean runner didn't.                                                    |

---

## Spec Gaps Exposed <!-- optional -->

- **Duplicate `push` events from GitHub.** Neither the spec nor ARCHITECTURE expected CI to run twice on one commit. The concurrency group and the last-success base handle it, but any later workflow with side effects should assume events can be delivered more than once.
- **Path filters don't cover root files.** The root `pnpm-lock.yaml` and `package.json` affect the web image but don't trigger a web deploy. Adding them to the web filter, or deploying the web app on every non-docs change, is a candidate follow-up.
- **The chunker's cold boot after each deploy** wasn't considered in 007 or 009. A warm-up request at the end of the deploy job would hide it, but it would have to come from inside Fly's network, since the chunker has no public IP.
- **Fly's log retention.** The spec's open question stays deferred: if the dropped rate needs history, logs need to go somewhere durable (a later item).
- **ARCHITECTURE's open decision about previews** belongs to 010 now and is moved there.

---

## Test Evidence <!-- required -->

Local suites, before the PR:

```
web:     Test Files  24 passed | 1 skipped (25); Tests  141 passed | 6 skipped (147)   # no local Postgres
chunker: 98 passed in 3.46s                                                           # 91 before; 7 new in tests/test_logs.py
lint: eslint clean; typecheck: tsc --noEmit clean; prettier: All matched files use Prettier code style!
actionlint (actionlint-py): no findings
```

Logs from a local production build of the web app (no database) and the chunker under uvicorn:

```
{"ts":"2026-10-01T05:50:18.537Z","level":"error","event":"server_fn_error","path":"/","error":"Error","message":"Failed query: select \"surface\", \"example_es\" from \"saved_chunks\" where \"saved_chunks\".\"user_id\" is null\nparams: "}
{"ts": "2026-10-01T05:50:34.085+00:00", "level": "warning", "logger": "chunker", "event": "chunk_error", "status": 422, "code": "invalid_input", "exc_type": "RequestValidationError"}
```

The dropped-rate one-liner on sample `fly logs` lines (two fast responses: 3 returned + 1 dropped, 4 returned + 0 dropped; one full-mode line and one error line ignored):

```
{"responses":2,"returned":7,"dropped":1,"dropped_rate":0.125}
```

PR #16, first CI run (36822395852), a real failure:

```
chunker  fail  8s    E   ModuleNotFoundError: No module named 'app'
web      pass  59s
```

PR #16 after the fix (36822540573):

```
chunker  pass  20s   ============================== 98 passed in 3.68s ==============================
web      pass  56s   ✓ src/server/saved.server.test.ts (6 tests) 115ms
                     Test Files  25 passed (25)
                     Tests  147 passed (147)        # Postgres suite ran: nothing skipped
```

The merge of PR #16 (`92e8464`) started two CI push runs (36822707258, 36822718885; both `run_attempt: 1`, both by the author, 9 s apart), both successful.

First automatic deploy (36822798035):

```
changes         success  06:03:36 → 06:03:42   no previous deploy found: deploying both
deploy-chunker  success  06:03:44 → 06:05:01   Visit your newly deployed app at https://trozo-chunker.fly.dev/
                                               [ { "Address": "fdaa:0:7244:0:1::7", "Type": "private_v6", ... } ]   # only entry
deploy-web      success  06:05:03 → 06:06:16   Running trozo-web release_command: node migrate.mjs
                                               ✔ release_command 6835e27a559678 completed successfully
                                               trozo-web.fly.dev/ -> 403 (want 403); /healthz -> 200 (want 200)
```

`fly logs -a trozo-web` for the release machine:

```
2026-10-01T06:05:56Z app[6835e27a559678] fra [info][migrate] applying migrations from /app/drizzle
2026-10-01T06:05:57Z app[6835e27a559678] fra [info][migrate] done
```

The duplicate run (36822892919) diffed against the first one and found nothing:

```
changed since 92e846425e75d24039699e3157892cc1a552b52a:
  (none)
changes success | deploy-chunker skipped | deploy-web skipped
```

Chunker state after the deploy (volume still attached to the machine; the machine is stopped, not suspended):

```
app  18590deb707318  2  fra  stopped   1 total, 1 warning
vol_r68l05ep832e20n4  created  chunker_cache  1GB  fra  …  18590deb707318
```

Production log lines. The first is the web app logging the protection check's request. The second is the chunker logging a cached request sent from the web machine over Flycast, which cost no LLM call:

```
app[d8d3090f975518] fra [info]{"ts":"2026-10-01T06:06:14.691Z","level":"warn","event":"access_denied","status":403,"method":"GET","path":"/","reason":"missing"}
app[18590deb707318] fra [info]{"ts": "2026-10-01T06:07:16.476+00:00", "level": "info", "logger": "chunker", "event": "chunk", "status": 200, "request_id": "req_f59b4510497b", "confidence_mode": "fast", "region": "neutral", "prompt_version": "p1", "cache_hit": true, "latency_ms": 1547, "chunks": 1, "dropped": 0}
```

(This was the first request after the deploy left the chunker stopped. The 1547 ms is time inside the handler, so it likely includes one-off loading after the boot; a warm cache hit wasn't measured here.)

GitHub secrets:

```
FLY_DEPLOY_TOKEN_CHUNKER  2026-10-01T05:45:26Z
FLY_DEPLOY_TOKEN_WEB      2026-10-01T05:49:38Z
```
