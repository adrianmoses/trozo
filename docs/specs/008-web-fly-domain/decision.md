# Decision Record: Web on Fly.io + Custom Domain

| Field   | Value                |
| ------- | -------------------- |
| id      | 008                  |
| status  | implemented          |
| created | 2026-09-29           |
| spec    | [spec.md](./spec.md) |

---

## Context <!-- required -->

006 made the web image deployable, and 007 put the chunker on Fly. 008 is the step that makes trozo usable away from the laptop.

Before 008 started, the author had created a Neon project in `aws-eu-central-1` (default database `neondb`, not `trozo` as first suggested) and bought `trozoapp.com` at Cloudflare. As bought, the domain was already on Cloudflare's nameservers with no records.

The work was split by who holds which account:

- **The agent:** the Fly side (app, secrets, deploys, certificates), all checks and the docs.
- **The author:**
  - the Cloudflare dashboard (DNS, SSL mode, redirect, Zero Trust team, Access application), from checklists the agent wrote;
  - the Access sign-in, where the agent does not handle login codes.

The Neon URL reached Fly without passing through the conversation. The author put it in the git-ignored `.env.production`, and the agent's commands read it from there, printing only its shape (pooled host, region, parameters).

## Decision <!-- required -->

Production is live at **https://trozoapp.com**:

- **Web app:** Fly app `trozo-web` (`personal` org, `fra`), one shared-cpu-1x **256 MB** machine. It suspends when idle, and each deploy runs `node migrate.mjs` against Neon as its `release_command`.
- **Config and secrets:** `CHUNKER_URL` and `CF_ACCESS_TEAM_DOMAIN` (`round-cake-32d9.cloudflareaccess.com`) are plain `fly.toml` config. `DATABASE_URL`, `CHUNKER_TOKEN` and `CF_ACCESS_AUD` are Fly secrets.
- **Cloudflare in front:**
  - proxied DNS to Fly's IPs;
  - SSL mode Full (strict), with a Fly Let's Encrypt certificate issued by DNS validation through `_acme-challenge`;
  - Always Use HTTPS;
  - a 301 redirect from `www` to the apex;
  - an Access application `trozo` covering both hostnames: one-time PIN login, only `adrian@thesolo.dev` allowed, sessions of 1 month.
- **Web app protection:** 006's middleware rejects anything without a valid Access JWT, so `trozo-web.fly.dev` returns 403 everywhere except `/healthz`.

---

## Alternatives Considered <!-- required -->

### Hostname

**Option A:** the app on the apex, with `www` redirecting.

- Pros: the shortest URL, and Cloudflare handles a proxied apex record without trouble.
- Cons: the apex isn't free for a public landing page later.

**Option B:** `app.trozoapp.com`.

- Pros: the apex stays free for later.
- Cons: a longer URL, and a public page wasn't wanted.

**Chosen:** A, the author's choice.

### Sign-in method

**Option A:** email one-time PIN.

- Pros: built in, nothing to configure.
- Cons: an email round trip roughly once a month.

**Option B:** GitHub or Google login.

- Pros: one click.
- Cons: an OAuth app to create and maintain.

**Chosen:** A, the author's choice.

### Web idle behaviour

**Option A:** suspend when idle.

- Pros: near-zero idle cost. Resume measured at 0.85 s, about 0.76 s over warm.
- Cons: a cold first request can wake three things in sequence: web, chunker and Neon.

**Option B:** always on.

- Pros: an instant first page.
- Cons: a VM billed around the clock for a single user.

**Chosen:** A, the author's choice.

### Web VM size

**Option A:** 512 MB, the starting point.

**Option B:** 256 MB.

- Pros: measured peak RSS was 101 MB after SSR, saves, `/saved` and all exports, which leaves about 2.3× headroom. It also means a smaller suspend snapshot.

**Chosen:** B. `fly scale memory` plus a line in `fly.toml` raises it again if needed.

### Where the `www` redirect lives

**Option A:** a Cloudflare Redirect Rule, answered at the edge.

- Pros: `www` never needs a Fly certificate or app code. The check showed it runs before Access.

**Option B:** redirect inside the app, with a Fly certificate for `www`.

- Cons: a second certificate plus app code, for no gain.

**Chosen:** A. The `www` DNS record uses the placeholder address `100::`, since its traffic never reaches an origin.

### Deploying before Access existed

**Option A:** deploy early and rely on 006's fail-closed 503 until `CF_ACCESS_AUD` is set.

**Option B:** set up Access first, then deploy.

**Chosen:** A. The public IPs and Fly's certificate records had to exist before Cloudflare could be configured. The app returned 503 for everything but `/healthz` in between, so it was never open.

---

## Tradeoffs <!-- required -->

- **Cold-path latency.** After a quiet spell, the first page load resumes the web app (about 0.85 s). The first translation also resumes the chunker (about 0.9 s) and wakes Neon's compute. A _stopped_ chunker (after host maintenance) takes about 11 s (007).
- **Single machines.** One web machine and one chunker machine means brief unavailability during host events and deploys. `--ha=false` is deliberate for a single user.
- **The shared IPv4 is fine behind Cloudflare.** Cloudflare connects over it using the SNI `trozoapp.com`. A dedicated IPv4 (paid) isn't needed.
- **The Access AUD is tied to one Access application.** Recreating the application changes the AUD, and every request then returns 403 until the secret is updated. DEPLOY.md warns about this.
- **The Cloudflare setup is manual dashboard state**, recorded in DEPLOY.md's checklist but not as code. Terraform or API automation would be a later item if it ever needs reproducing.

---

### Spec Divergence <!-- optional -->

| Spec Said                                                  | What Was Built                                                                                      | Reason                                                                                                                                                    |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Neon database named as created; `trozo` suggested in 006   | Neon's default `neondb`                                                                             | The author's setup choice. The app doesn't depend on the database name. DEPLOY.md is corrected.                                                           |
| `fly certs add` for `trozoapp.com` (and `www` if needed)   | A certificate for the apex only; `www` gets a placeholder proxied record                            | The `www` redirect is answered at Cloudflare's edge, before Access, and never reaches Fly (see Alternatives).                                             |
| Web VM measured, starting at 512 MB                        | Measured at 512 MB, then set to 256 MB (`fly scale memory 256`, with `fly.toml` updated)            | As specified. Recorded because the first deploys ran at 512 MB.                                                                                           |
| End-to-end check by the agent "in a fresh browser"         | The author signed in in their own Chrome; the agent then drove a new tab in that session            | The agent doesn't enter login codes. The Access login in a fresh session was checked with curl (302 to the Access login) and by the author's own sign-in. |
| Exports verified by downloading                            | Fetched inside the signed-in page (status, content type, line count, chunk present), not downloaded | This avoids saving files to the author's machine; it exercises the same `/api/export` responses.                                                          |
| Open question: `channel_binding` might break node-postgres | It works (migrate succeeded with `channel_binding=require`); the production URL omits it            | Resolved by validation. Either form is fine.                                                                                                              |

No code changed: only `apps/web/fly.toml` and docs. That matches the spec's "no code changes unless validation finds a defect".

---

## Spec Gaps Exposed <!-- optional -->

- **Neon's own idle behaviour wasn't measured.** The first query after Neon's compute scales to zero adds its own wake time, on top of the two Fly resumes. 009's observability work could log the first-query latency.
- **The Cloudflare setup has no code form.** If previews (009) need Access applications per preview hostname, doing that by hand won't scale. 009 should decide between a wildcard Access application and the API.
- **The saved test chunk.** The end-to-end check left one real saved chunk (_tener (mucha) hambre_) in production. It's kept, since it's the author's data now. Future checks should delete what they create, or use a preview branch.

---

## Test Evidence <!-- required -->

Validation 1: `migrate.mjs` against Neon's pooled URL, read from `.env.production` and never printed.

```
URL shape: scheme postgresql | pooled host True | eu-central-1 True | db neondb | params {'sslmode': ['verify-full']}
--- run 1
[migrate] applying migrations from …/apps/web/dist/drizzle
[migrate] done
exit=0
--- run 2
[migrate] done
--- with channel_binding=require
[migrate] done
{ migrations: '1', saved_chunks: true, pg: '18.6 (6569466)', ssl: false }   # pg_stat_ssl = pooler→compute hop
client socket: { tls: true, protocol: 'TLSv1.3', authorized: true,
                 certSubject: '*.c-5.eu-central-1.aws.neon.tech', issuer: "Let's Encrypt" }
plaintext refused: connection is insecure (try using `sslmode=require`)
```

First deploy, before Access existed (fail-closed):

```
Provisioning ips for trozo-web
  Dedicated ipv6: 2a09:8280:1::19f:f704:0
  Shared ipv4: 66.241.124.134
Running trozo-web release_command: node migrate.mjs
✔ release_command 82d623b724e708 completed successfully
[migrate] applying migrations from /app/drizzle
[migrate] done
trozo-web.fly.dev/ -> 503
trozo-web.fly.dev/healthz -> 200
trozo-web.fly.dev/api/export?format=csv -> 503
trozo-web.fly.dev/_serverFn/x -> 503
Cloudflare Access is not configured: set CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD
```

Web to chunker over Flycast, from the web machine:

```
200 [ [ 'extrañar', 'high' ] ] cached true
```

Certificate and DNS (validation 2):

```
fly certs check trozoapp.com:  Status = Issued, Issued = rsa,ecdsa
dig A trozoapp.com @1.1.1.1: 172.67.155.93 104.21.7.13            # Cloudflare proxy
dig CNAME _acme-challenge.trozoapp.com: trozoapp.com.e5d5xrj.flydns.net.
dig TXT _fly-ownership.trozoapp.com: "app-e5d5xrj"
origin cert: subject=CN=trozoapp.com issuer=Let's Encrypt YE1 notAfter=Dec 28 06:20:54 2026 GMT
```

Second deploy, with Access config (release is a no-op):

```
✔ release_command 811e42f9757608 completed successfully
[migrate] done
```

Protection checks (validation 3):

```
== trozo-web.fly.dev (bypass attempt)
/ -> 403
/healthz -> 200
/api/export?format=csv -> 403
/_serverFn/x -> 403
/saved -> 403
forged JWT (right aud/iss, bad signature) on fly.dev / -> 403
== trozoapp.com (no session)
/ -> 302 location: https://round-cake-32d9.cloudflareaccess.com/cdn-cgi/access/login/trozoapp.com?kid=de427c…
forged JWT on trozoapp.com -> 302
== www
http://www.trozoapp.com/saved?x=1 -> 301 location: https://www.trozoapp.com/saved?x=1
https://www.trozoapp.com/saved?x=1 -> 301 location: https://trozoapp.com/saved?x=1
== http
http://trozoapp.com -> 301 location: https://trozoapp.com/
```

End to end on `https://trozoapp.com`: the author signed in with the one-time PIN, then the agent drove a new tab in the same session.

```
"I'm really hungry" → Tengo mucha hambre.
  01 verified · tener (mucha) hambre
  traps: Estoy muy hambriento (calque) · tengo mucho hambre (gender/article)
  variant: estar muerto de hambre · coloquial · medium    # full confidence settled
Save → Saved ✓
/saved → tener (mucha) hambre · neutral · Tengo mucha hambre. · high
exports: csv: 200 text/csv lines=6 hasChunk=true | cloze: 200 text/csv lines=6 hasChunk=true | txt: 200 text/plain lines=1 hasChunk=true
```

Measurements:

```
web peak RSS (process since 07:32:26 boot, after the e2e): VmHWM 101460 kB, VmRSS 87820 kB, MemTotal 469892 kB (512 MB VM)
web cold boot: Machine started in 1.743s, then "Listening on: http://localhost:3000/" 2 s later
web suspend → resume (256 MB):
09:41:02 suspended
healthz #1 200 0.853734s
healthz #2 200 0.099613s
healthz #3 200 0.080997s
```

Suites (unchanged code):

```
web:     Test Files 23 passed | 1 skipped (24); Tests 133 passed | 6 skipped (139)   # Postgres suite skipped without TEST_DATABASE_URL
chunker: 91 passed in 3.80s
```

Final state:

```
trozo-web  d8d3090f975518  fra  started  1 total, 1 passing   shared-cpu-1x:256MB
trozoapp.com  Fly  Issued
```
