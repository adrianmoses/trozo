# Spec: CI/CD and Operations

| Field   | Value      |
| ------- | ---------- |
| id      | 009        |
| status  | approved   |
| created | 2026-09-30 |

---

## Why <!-- required -->

Production has been live at https://trozoapp.com since 008, but every deploy is a manual `fly deploy` from the author's laptop. Nothing stops an untested or broken commit from reaching production. There is also no view of how the live service behaves: LLM spend has no provider-side cap, and the `meta.dropped` count (chunks that validation removes, bug 003) is visible only in individual responses. This feature makes merging to `main` the only path to production, gates that path on the test suites, and gives the author enough logging and spend limits to notice when something goes wrong.

### Consumer Impact <!-- required -->

- **The author, as single user and operator:** a merged PR deploys itself, and only if the tests passed. The right app deploys in the right order, and migrations still run before the new version takes traffic. `fly logs` shows one structured line per request, with latency, cache hit and dropped count. Spend limits cap the damage if something runs away.
- **Portfolio reviewers (secondary):** a visible CI pipeline and green checks on PRs, alongside the eval harness.

### Roadmap Fit <!-- required -->

009 is the last of the production-deployment items (006–009). It depends on:

- 006: the bundled `migrate.mjs`, health checks, and the Access check.
- 007: the private chunker on Fly, its cache volume, and the single-machine rule.
- 008: the web app on Fly and the manual deploy commands in `docs/DEPLOY.md`.

The workflows in 009 automate exactly those commands.

Per-PR preview apps were part of 009 in the roadmap. They are split out as **010** (`planned`), because putting previews behind Access is an unsolved design problem: Fly's `*.fly.dev` hostnames can't sit behind Cloudflare Access, and a per-preview hostname on `trozoapp.com` needs DNS records and certificates for each preview. Decided for 010 during this discovery: a preview will call the shared production chunker, not its own.

---

## What <!-- required -->

### Acceptance Criteria <!-- required -->

- [ ] Every PR to `main` runs a CI workflow with these checks: `prettier --check`, web ESLint, web type check, web Vitest (including the Postgres suite against a Postgres 16 service container through `TEST_DATABASE_URL`, with none of its tests skipped), and chunker pytest. A failure in any of them fails the check.
- [ ] CI runs on PRs from forks (the repo is public) without access to any secret.
- [ ] Merging to `main` deploys to production only after CI passes on that commit. Nothing deploys if CI fails.
- [ ] Only the apps affected by the merge deploy:
  - the chunker when `services/chunker/**` or `evals/seed/**` changed;
  - the web app when `apps/web/**` or `packages/schema/**` changed.
  - When both changed, the chunker deploys first and the web app deploys only if the chunker deploy succeeded.
- [ ] Deploys use the same commands and flags as `docs/DEPLOY.md` (`--ha=false`). Afterwards:
  - `fly ips list -a trozo-chunker` still shows only the private address;
  - the cache volume is still attached;
  - the web app's `release_command` migration runs before the release takes traffic.
- [ ] Deploys never overlap: a second merge waits for the running deploy.
- [ ] Each app is deployed with its own app-scoped Fly deploy token, stored as a GitHub Actions secret. No org-wide token is stored.
- [ ] After a web deploy, the workflow checks the protection: `https://trozo-web.fly.dev/` returns 403 and `/healthz` returns 200. If either fails, the workflow fails.
- [ ] A manual `workflow_dispatch` can deploy either app from `main` (a re-deploy without a code change).
- [ ] The chunker logs one JSON line per `POST /v1/chunk` request with: `confidence_mode`, `region`, `prompt_version`, `cache_hit`, `latency_ms`, `chunks` (count returned) and `dropped` (count in `meta.dropped`). Errors are logged as JSON with the exception type. The input phrase is not logged.
- [ ] The web app logs one JSON line per server-function call to the chunker (function name, status, `latency_ms`) and per failed request (route, error message). Access rejections are logged without the JWT.
- [ ] `fly logs -a trozo-chunker` and `fly logs -a trozo-web` show those lines in production.
- [ ] Monthly spend limits are set in the Anthropic and OpenAI consoles by the author. `docs/DEPLOY.md` records the amounts and where they are set.
- [ ] `docs/DEPLOY.md` covers the automated flow: GitHub secrets, how to rotate a deploy token, manual dispatch, and rollback with `fly releases` / `fly deploy --image`. It also covers reading the logs, including a one-liner that computes the dropped rate from `fly logs` output.
- [ ] ROADMAP lists 010 (preview apps) as `planned`. The Access question and the shared-chunker decision are recorded there.

### Non-Goals <!-- required -->

- **Preview apps per PR:** moved to 010.
- **Running the evals in CI:** they spend LLM credit, and they stay a local, per-prompt-change step.
- **Building Docker images on PRs:** images are built only by the deploy jobs, on Fly's remote builders.
- **Shipping logs to an external service, dashboards or alerting:** `fly logs` is the interface.
- **Cloudflare configuration as code** (DNS, Access): it stays manual dashboard state, as in 008.
- **A rollback workflow:** rollback stays a documented manual command.
- **Multiple machines or HA** for either app.
- **An app-level cost cap in the chunker:** spend is capped by the providers.

### Open Questions <!-- optional -->

- **Is the Fly logs retention window enough to compute a meaningful dropped rate?** Deferred. If it isn't, log shipping becomes a later item. It doesn't change 009's scope.
- **Should the chunker's per-request log line also go to eval runs' JSONL?** Deferred. Evals already record `meta.dropped` in their raw results.

---

## How <!-- required -->

### Approach <!-- required -->

**1. CI workflow** (`.github/workflows/ci.yml`, `pull_request` and `push` to `main`)

- **`web` job:** pnpm (version from `packageManager`) with its store cached, and Node 22. It runs `pnpm check` (Prettier), `pnpm --filter web lint`, a new `typecheck` script (`tsc --noEmit`), and `pnpm --filter web test`. A `postgres:16` service container supplies `TEST_DATABASE_URL`, so the saved-chunks suite runs instead of being skipped.
- **`chunker` job:** `astral-sh/setup-uv`, then `uv sync` and `uv run pytest` in `services/chunker`. LLM calls are already faked. spaCy's `es_core_news_sm` comes from the lockfile or install step as locally.
- **Secrets:** none. Fork PRs work unchanged.

**2. Deploy workflow** (`.github/workflows/deploy.yml`)

- **Trigger:** `workflow_run` of CI completed on `main` with `conclusion == success`, plus `workflow_dispatch` with an `app` input (`chunker | web | both`).
- **Concurrency:** group `deploy-production`, `cancel-in-progress: false`.
- **`changes` job:** diffs the deployed commit against the previous successful deploy (or `HEAD^`) with path filters to decide which apps deploy.
- **`deploy-chunker` job:** `superfly/flyctl-actions/setup-flyctl`, then `fly deploy . --config services/chunker/fly.toml --ha=false` with `FLY_API_TOKEN` set to `FLY_DEPLOY_TOKEN_CHUNKER`. It then asserts that `fly ips list` shows no public address and fails the job if it does.
- **`deploy-web` job:** `needs: deploy-chunker` (and is skipped cleanly when the chunker didn't need a deploy). It runs `fly deploy . --config apps/web/fly.toml --ha=false` with `FLY_DEPLOY_TOKEN_WEB`, then the protection curl checks.
- **Tokens:** one per app, created with `fly tokens create deploy -a <app>`. The author adds them as repository secrets. The agent never handles token values.

**3. Structured logs**

- **Chunker:** a small JSON log formatter on the stdlib `logging` setup that `app/pipeline/full.py` already uses. The request line is emitted from the `/v1/chunk` handler after the response is built, so it reads `meta.dropped`, the cache flag and the timing. Uvicorn's access log stays as it is.
- **Web:** a tiny `log.server.ts` helper that writes JSON to stdout. It is called from the chunker client (`chunker.server.ts`) and the request middleware's error path.
- **Privacy:** neither service logs the input phrase, tokens, JWTs or connection strings.

**4. Spend limits and docs**

- **Spend limits:** the author sets monthly limits in both provider consoles. DEPLOY.md records them.
- **DEPLOY.md** gains a "CI/CD" section and a "Logs" section, and the manual deploy commands are relabeled as fallback.
- **ROADMAP:** 009 moves to `in-progress`, and 010 is added.

### Confidence <!-- required -->

**Level:** Medium-High

**Rationale:**

- **Well understood:** every deploy command has already run by hand in 007 and 008, the workflows are standard GitHub Actions, and the logging change is small.
- **Uncertain:**
  - A deploy from a GitHub runner with an app-scoped deploy token has not been tried yet. It needs to use Fly's remote builder, keep the chunker's private-only IP and volume, and run the web app's `release_command`.
  - The Postgres suite has only run against a local database, not a CI service container.
  - The `workflow_run` trigger's view of which files changed needs care, so the path filter compares against the right base.

**Validate before proceeding:**

1. **Spike: token-scoped deploy.** From the laptop, with only a `fly tokens create deploy -a trozo-chunker` token in `FLY_API_TOKEN`, run the chunker deploy. Confirm that the build, deploy, `fly ips list` and the volume attachment all work under that token. Repeat for the web app, where the `release_command` must still run.
2. **First CI run:** check that the web job reports the Postgres suite as run, not skipped.
3. **Change detection:** test the `changes` job with a dispatch and a docs-only commit before trusting it. A docs-only merge must deploy nothing.

### Key Decisions <!-- optional -->

- **Previews split out to 010**, the author's choice. Access for preview hostnames needs a design of its own.
- **Deploy gated through `workflow_run` on CI**, not a duplicated test job. The tests run once, and a deploy can only follow a green run on the same commit.
- **App-scoped deploy tokens, one per app**, not an org token. A leaked token can deploy one app, but can't create apps or add public IPs to another.
- **Chunker before web.** The web app depends on the chunker's contract, and contract fields added later are optional (ARCHITECTURE), so an older web app with a newer chunker is safe. The reverse order is not guaranteed to be.
- **Logs to stdout as JSON, read with `fly logs`**, the author's choice of minimal ops. It needs no new service or secret.

### Testing Approach <!-- required -->

- **Unit tests:**
  - chunker (pytest): the JSON formatter emits the fields listed above and never the input text, including on the error path;
  - web (Vitest): `log.server.ts` output shape, and the chunker client logs status and latency on success and on failure, without the token.
- **CI itself:**
  - a PR with a deliberately failing test shows a red check and deploys nothing when merged into a throwaway branch run (or is reverted before merge);
  - a normal PR shows all jobs green with the Postgres suite counted as run.
- **Deploy validation**, recorded in the decision record:
  - the spike output;
  - a merge that changes only the web app deploys only the web app (with `[migrate] done` in its log);
  - a merge touching the chunker deploys the chunker first, and `fly ips list` still shows only the private address;
  - a docs-only merge deploys nothing;
  - the post-deploy protection check passes (403 and 200).
- **Logs:** after a production translation, `fly logs` shows the chunker request line (with `dropped` and `cache_hit`) and the web line. The dropped-rate one-liner in DEPLOY.md gives a number.
- **Existing suites stay green:** web Vitest and chunker pytest.
