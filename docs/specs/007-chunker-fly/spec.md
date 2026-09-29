# Spec: Chunker on Fly.io

| Field   | Value      |
| ------- | ---------- |
| id      | 007        |
| status  | approved   |
| created | 2026-09-29 |

---

## Why <!-- required -->

The web app on Fly (008) needs a chunk service to call. That service holds the Anthropic and OpenAI keys, so ARCHITECTURE requires it to be unreachable from the internet. Anyone who could reach it could spend LLM credit.

006 made the chunker image self-contained, with the seed baked in and `seed_entries` reported. 007 turns that image into a running Fly app:

- private networking only;
- a volume for the response cache the evals and relabel-on-read depend on;
- a machine size and idle behaviour measured, not guessed.

Separate from the web app, this can be checked in isolation (Flycast reachability, suspend/resume, memory) before any user traffic depends on it.

### Consumer Impact <!-- required -->

- **The author, as operator:** gets a deployed, private chunk service in `fra` next to Neon, with a documented deploy command, secrets and a smoke test. Idle cost is close to zero, because the machine suspends when idle.
- **The author, as single user:** nothing visible until 008 connects the web app. After that, the first phrase after an idle period pays a resume delay, measured here.
- **Integration points:**
  - The web app (008) calls `http://trozo-chunker.flycast` with `Authorization: Bearer $CHUNKER_TOKEN`. Fly's proxy starts or resumes the machine on that request.
  - Fly's health check calls `GET /v1/health`.
  - `GET /v1/meta` (`seed_entries`) confirms the seed after each deploy.

### Roadmap Fit <!-- required -->

- **Depends on 006:** the self-contained image, `seed_entries`, and `docs/DEPLOY.md`.
- **Blocks 008**, which sets the web app's `CHUNKER_URL` to this app's Flycast address.
- **009** reuses the deploy command in CI. It also decides whether preview apps get their own chunker or share this one.

---

## What <!-- required -->

### Acceptance Criteria <!-- required -->

Private service, written as the operator:

- [ ] A Fly app `trozo-chunker` runs in `fra` from `services/chunker/Dockerfile`, deployed from the repo root with one documented command.
- [ ] The app has **no public IP**. `fly ips list` shows only a private (Flycast) IPv6 address, and the `trozo-chunker.fly.dev` hostname doesn't serve it.
- [ ] From another machine in the same Fly organization, `http://trozo-chunker.flycast/v1/health` returns 200. `POST /v1/chunk` with the token returns a chunk response, and without it returns 401.
- [ ] Secrets `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` and `CHUNKER_TOKEN` are set as Fly secrets and nowhere in the repo.

Token guard, written as the operator:

- [ ] On Fly (`FLY_APP_NAME` set) with `CHUNKER_TOKEN` unset, `POST /v1/chunk` returns 503 with a message naming `CHUNKER_TOKEN`. `/v1/health` and `/v1/meta` stay open. Off Fly, behaviour is unchanged: an unset token means open, for local dev and tests.

Cache and machine:

- [ ] A 1 GB volume in `fra` is mounted at `/app/.cache`. A repeated phrase is served from the cache (`meta.cached: true`), and still is after the machine restarts.
- [ ] The app runs as exactly one machine. DEPLOY.md records why: a volume belongs to one machine.
- [ ] The machine suspends when idle and resumes on the next Flycast request. If suspend doesn't work with a volume attached, it stops instead, and the decision record says so.
- [ ] The VM size is chosen from measured memory (peak RSS during a full-confidence request), with headroom stated in the decision record.
- [ ] Resume time (from suspended) and cold-start time (from stopped) to the first `/v1/health` 200 are measured and recorded.
- [ ] Fly's health check on `/v1/health` passes after deploy.

Docs:

- [ ] DEPLOY.md gains the chunker deploy steps: app creation, volume, private IP, secrets, deploy and smoke test.
- [ ] ARCHITECTURE's open decision on chunker VM size, cold start and auto-stop is resolved.

Engineering:

- [ ] The chunker pytest suite passes, including new tests for the token guard.

### Non-Goals <!-- required -->

- **No web app on Fly and no Neon wiring** (008).
- **No CI deploys, preview chunkers or spend limits** (009).
- **No horizontal scaling, second machine or shared cache.** A single machine is an accepted limit.
- **No change to the pipeline, prompts or cache format.**
- **No public endpoint, even temporarily.** Smoke tests use Flycast from inside the organization, or `fly proxy`.

### Open Questions <!-- optional -->

- **App name availability.** Fly app names are global. If `trozo-chunker` is taken, use the next free variant, and update DEPLOY.md and 008's `CHUNKER_URL` to match. Resolved at app creation.

---

## How <!-- required -->

### Approach <!-- required -->

1. **Token guard** (`services/chunker/app/main.py`, in `require_token`): when `CHUNKER_TOKEN` is unset and `FLY_APP_NAME` is set, raise a 503 error (`service_misconfigured`) naming the variable. It is still read per request and never at import, so tests can toggle it. Add pytest cases for all four combinations.
2. **`services/chunker/fly.toml`:**
   - `app = "trozo-chunker"`, `primary_region = "fra"`;
   - `[build] dockerfile` pointing at the chunker Dockerfile, deployed with `fly deploy --config services/chunker/fly.toml` from the repo root, so the build context includes `evals/seed`;
   - `[http_service]`: `internal_port = 8000`, `auto_stop_machines = "suspend"`, `auto_start_machines = true`, `min_machines_running = 0`, `force_https = false` (Flycast is plain HTTP inside the private network);
   - an HTTP check on `/v1/health`;
   - `[[mounts]]` with source `chunker_cache` at `/app/.cache`;
   - `[[vm]]` shared-cpu-1x, 1 GB to start.
3. **Create and deploy** (operator steps, recorded in DEPLOY.md):
   - `fly apps create trozo-chunker`;
   - `fly volumes create chunker_cache --region fra --size 1`;
   - generate `CHUNKER_TOKEN` (`openssl rand -hex 32`) and `fly secrets set ... --stage`;
   - `fly deploy --config services/chunker/fly.toml --no-public-ips --ha=false`;
   - `fly ips allocate-v6 --private`;
   - confirm `fly ips list` shows only the private address.
4. **Smoke test** from a throwaway machine in the organization (`fly machine run --rm curlimages/curl ...`, or `fly ssh console` on the chunker itself using the Flycast hostname). Check health, meta (`seed_entries` 153), and a chunk request with and without the token. Also check that `trozo-chunker.fly.dev` doesn't serve.
5. **Measure:**
   - peak RSS during a full-confidence request (`fly ssh console` with `/proc` or `ps`);
   - suspend and resume latency: idle until suspended, then time the first health 200 over Flycast;
   - cold-start latency: force a stop, then time the same.

   Choose the final VM memory and record every figure.

6. **Docs:** DEPLOY.md steps and the single-machine limit; ARCHITECTURE's open decision resolved, with the measured numbers.

### Confidence <!-- required -->

**Level:** Medium

**Rationale:**

- **Well understood:** the image already runs unchanged (006), and Flycast with auto-start, volumes and secrets are standard Fly features.
- **Uncertain:**
  - Whether `suspend` works with a volume attached. Fly's docs have limited suspend to certain machine configurations, so it may silently act like `stop` or be refused.
  - The real resume and cold-start times with spaCy.
  - Whether the build context works as intended from the repo root with `--config` pointing into `services/chunker`.

**Validate before proceeding:**

- Deploy once with `auto_stop_machines = "suspend"` and wait for idle. Confirm the machine state is `suspended`, not `stopped`, with `fly machine list`, and time a resume. If it's refused or falls back, switch to `stop` and time a cold start.
- Confirm the first deploy's build includes the seed: `/v1/meta` reports 153 entries.
- Confirm there is no public IP before setting the LLM secrets live (secrets are staged, so the first deploy carries them, but the app is private from its first release).

### Key Decisions <!-- optional -->

- **Suspend when idle** (the author's choice). It costs almost nothing while idle and resumes fast. Always-on was rejected on cost, and `stop` is kept as the fallback.
- **Fail closed without the token on Fly** (the author's choice). This is the same pattern as 006's Access check. A private network alone isn't the only guard between the internet and the LLM keys.
- **Flycast over plain `.internal` DNS.** Only Flycast goes through Fly's proxy, which is what starts and resumes the machine on demand.
- **One machine with a volume.** The disk cache stays as designed, and scaling out would need a shared cache (a non-goal).
- **Deploy with `--no-public-ips` from the first release**, so the service is never public, even briefly.

### Testing Approach <!-- required -->

- **Chunker unit tests** (pytest, as in OVERVIEW):
  - on Fly with no token: `POST /v1/chunk` returns 503 naming `CHUNKER_TOKEN`, and health and meta return 200;
  - on Fly with a token: a request without auth gets 401, and one with auth gets 200;
  - off Fly with no token: requests are open, unchanged.
- **Deployed smoke test**, recorded in the decision record:
  - `fly ips list` shows a private address only;
  - `trozo-chunker.fly.dev` doesn't serve;
  - over Flycast: `/v1/health` 200, `/v1/meta` with `seed_entries` 153, `POST /v1/chunk` with the token returns 200 and without it 401;
  - a repeated phrase returns `cached: true` after a machine restart.
- **Measurements:** peak RSS, resume time, cold-start time and final VM size, all recorded.
- The **existing chunker suite** stays green. The web suite is unaffected.
