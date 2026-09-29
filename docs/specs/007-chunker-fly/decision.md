# Decision Record: Chunker on Fly.io

| Field   | Value                |
| ------- | -------------------- |
| id      | 007                  |
| status  | implemented          |
| created | 2026-09-29           |
| spec    | [spec.md](./spec.md) |

---

## Context <!-- required -->

006 left a self-contained chunker image. 007 deployed it as the Fly app `trozo-chunker` in the author's `personal` organization (region `fra`, next to the Neon project), before the web app exists on Fly.

The author staged the LLM keys from `.env.local` with a `!` command, so the values never passed through the agent. The first two attempts staged empty strings, because the agent's shell had been left in `services/chunker` by an earlier `cd`, and `.env.local` is relative to the repo root. Nothing was deployed at that point. The keys were re-staged from the root, and the three secret digests were checked to be distinct before the first deploy. DEPLOY.md now says to always run flyctl from the repo root.

## Decision <!-- required -->

- **App.** `trozo-chunker` runs as **one shared-cpu-1x 512 MB machine** in `fra`, built from `services/chunker/Dockerfile` with the repo root as build context. Every deploy uses `fly deploy . --config services/chunker/fly.toml --ha=false`.
- **Private only.** The first deploy used `--no-public-ips`. The app's only address is a private Flycast IPv6 (`fdaa:0:7244:0:1::7`), and the web app will call `http://trozo-chunker.flycast`.
- **Idle behaviour.** The machine **suspends when idle** (`auto_stop_machines = "suspend"`, `min_machines_running = 0`) and Flycast resumes it on demand: about 0.9 s from suspended, about 11 s from stopped.
- **Cache volume.** A 1 GB encrypted volume `chunker_cache` is mounted at `/app/.cache` and keeps the response cache across restarts.
- **Token guard.** On Fly, the chunk endpoint **fails closed** without `CHUNKER_TOKEN` (503 `service_misconfigured`); health and meta stay open.
- **Secrets.** `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` and `CHUNKER_TOKEN` are Fly secrets. The token value is shared with the web app in 008.

---

## Alternatives Considered <!-- required -->

### Idle behaviour

**Option A:** suspend when idle.

- Pros: about 0.9 s to resume. It costs almost nothing while idle, since a suspended machine bills only for its snapshot storage and the volume.
- Cons: the first request after roughly 8 idle minutes pays about 0.75 s over warm.

**Option B:** stop when idle.

- Pros: the same near-zero idle cost.
- Cons: about 11 s cold start, for Python imports and spaCy.

**Option C:** always on.

- Pros: no delay.
- Cons: pays for a VM around the clock for a single-user tool.

**Chosen:** A, the author's choice. The spec's fallback to B wasn't needed: `fly machine list` showed `suspended` with the volume attached, and the resume logs showed no reboot.

### VM memory

**Option A:** 1 GB, the spec's starting point.

- Pros: 3.7× headroom.
- Cons: a bigger suspend snapshot, and double the running cost.

**Option B:** 512 MB.

- Pros: about 1.8× headroom over the measured 260 MB peak. A smaller snapshot means faster suspend and resume, and the running cost halves.
- Cons: less room if concurrency or model size grows.

**Chosen:** B. The single user makes concurrent full-confidence requests unlikely, and memory can be raised again with `fly scale memory` plus a line in `fly.toml`.

### Chunker without a token on Fly

**Option A:** fail closed (503), keyed on `FLY_APP_NAME`.

**Option B:** rely on the secret being set, and on the private network.

**Chosen:** A, the author's choice, matching 006's Access check. A forgotten secret, or a later accidental public IP, can't expose the LLM keys unguarded.

### How to smoke-test a private app

**Option A:** a throwaway machine elsewhere in the org, running curl.

**Option B:** `fly ssh console` on the chunker, calling its own Flycast hostname.

**Option C:** `fly proxy` from the laptop to `trozo-chunker.flycast`.

**Chosen:** B for the functional checks, since the request still goes through Fly's proxy. C was used for resume and cold-start timing, because an SSH session would itself wake the machine. A was unnecessary: both routes go through Flycast's proxy, which is what the web app will use.

---

## Tradeoffs <!-- required -->

- **One machine, one volume.** There's no redundancy: a host failure means downtime until Fly reschedules the machine, and the cache lives on one volume. Fly snapshots it daily, with 5 kept.
- **Resume cost.** The first phrase after about 8 idle minutes is slower by about 0.75 s. A machine that ends up _stopped_ (host maintenance, a manual stop) costs about 11 s. During that boot, Fly's proxy logged `failed to connect to machine: gave up after 15 attempts (in 8.2s)`, but it retried, and the request still returned 200 after about 19 s. 008's chunker client timeout must allow for this.
- **512 MB headroom is modest** (about 1.8×). Re-measure if the prompt, models or concurrency change.
- **The token guard is keyed on `FLY_APP_NAME`.** Any other host would need its own signal.

---

### Spec Divergence <!-- optional -->

| Spec Said                                                                                 | What Was Built                                                                                | Reason                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Smoke test "from another machine in the same Fly organization"                            | From the chunker's own machine (via its Flycast hostname) and from the laptop via `fly proxy` | Both routes go through Fly's proxy exactly as the web app will, and a separate machine would have woken nothing extra. See Alternatives.                                        |
| The token guard verified by pytest                                                        | Verified by pytest only; not exercised live by unsetting the secret                           | Unsetting the production secret would restart the machine for no extra signal. The guard ships in the deployed image (the edit preceded the first deploy).                      |
| Deploy command `fly deploy --config services/chunker/fly.toml --no-public-ips --ha=false` | `fly deploy . --config …` (explicit `.`)                                                      | The explicit working directory makes the repo root the build context. `[build] dockerfile` resolves relative to `fly.toml`. The 153 seed entries confirm the seed was included. |
| Final VM size from measurement                                                            | 512 MB, set with `fly scale memory 512`, and `fly.toml` updated to match                      | As specified. Recorded here because the first deploy ran at 1 GB.                                                                                                               |

Otherwise the implementation matches the spec.

---

## Spec Gaps Exposed <!-- optional -->

- **Web client timeout (008).** The web app's chunker client must tolerate a roughly 20 s worst case (a stopped machine) on the first request. Check `chunker.server.ts`'s timeout in 008.
- **Previews (009).** A per-PR preview chunker would add a cold volume per PR, with no cache. That leans toward previews sharing `trozo-chunker`, which is a 009 decision.
- **Operator ergonomics.** The `!` shell runs in the agent's working directory, so repo-relative paths in suggested commands are fragile. DEPLOY.md now says to always run flyctl from the repo root.

---

## Test Evidence <!-- required -->

Chunker unit tests:

```
$ uv run pytest -q
91 passed in 3.22s

tests/test_token_guard.py::test_on_fly_without_token_refuses_chunk PASSED
tests/test_token_guard.py::test_on_fly_without_token_keeps_health_and_meta_open PASSED
tests/test_token_guard.py::test_on_fly_with_token_requires_it PASSED
tests/test_token_guard.py::test_off_fly_without_token_stays_open PASSED
```

Deploy and private networking:

```
$ fly deploy . --config services/chunker/fly.toml --no-public-ips --ha=false
image size: 141 MB
> Machine 18590deb707318 [app] was created
Your app is deployed but does not have a public or private IP address

$ fly ips allocate-v6 --private -a trozo-chunker
$ fly ips list -a trozo-chunker
 v6      │ fdaa:0:7244:0:1::7 │ private ingress │ global │ default

$ curl -m 10 https://trozo-chunker.fly.dev/v1/health
public trozo-chunker.fly.dev -> 000   (no response)

$ fly secrets list -a trozo-chunker
 CHUNKER_TOKEN     │ 4a5d0b87b2c2e29a
 ANTHROPIC_API_KEY │ 606592a9fdba46ad
 OPENAI_API_KEY    │ fd47abfdb4fc364f
```

Smoke test over Flycast (`fly ssh console`, calling `http://trozo-chunker.flycast`):

```
health 200 {'status': 'ok'}
meta 200 seed_entries= 153 verifier= gpt-5.4-mini
chunk no token 401 unauthorized
chunk wrong token 401 unauthorized
chunk with token 200 [('extrañar', 'high')] cached= False 4.1s
```

Memory (1 GB machine, fast and full requests on two new phrases):

```
fast I'm looking forward to the weekend 7.5s ['high', 'high']
full I'm looking forward to the weekend 10.7s ['high', 'high']
fast It's raining cats and dogs 5.0s ['high']
full It's raining cats and dogs 5.5s ['high']
pid 644 peak RSS 21324 kB     # uv wrapper
pid 659 peak RSS 239176 kB    # uvicorn worker
MemTotal: 985220 kB
```

Cache survives a restart (after `fly scale memory 512`):

```
/proc/uptime 23.37
cache entries on volume: 5
chunk with token 200 [('extrañar', 'high')] cached= True 0.0s
```

Suspend and resume (poll of `fly machine list`, then `fly proxy 18080:80 trozo-chunker.flycast`):

```
08:41:53 started
...
08:49:32 started
08:50:03 suspended
state before: suspended
resume  /v1/health 200 0.891661s
warm    /v1/health 200 0.133879s
warm    /v1/health 200 0.120211s
state after: started
```

Cold start (`fly machine stop`, then the same request):

```
cold    /v1/health 200 18.766678s   # request arrived while the machine was still stopping
06:50:27Z app    reboot: Restarting system
06:50:34Z proxy  Starting machine
06:50:36Z runner Machine started in 1.595s
06:50:36Z app    Mounting /dev/vdc at /app/.cache
06:50:44Z proxy  failed to connect to machine: gave up after 15 attempts (in 8.201425158s)
06:50:45Z app    INFO:     Application startup complete.
06:50:45Z health Health check 'servicecheck-00-http-8000' on port 8000 is now passing.
```

About 11 s from the machine starting to uvicorn serving: 1.6 s VM boot, then about 9 s of Python and spaCy imports.

Final state:

```
1 machine(s) [('started', 512)]
vol_r68l05ep832e20n4   chunker_cache   1GB    fra
```
