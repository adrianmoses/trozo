# Spec: Web on Fly.io + Custom Domain

| Field   | Value      |
| ------- | ---------- |
| id      | 008        |
| status  | approved   |
| created | 2026-09-29 |

---

## Why <!-- required -->

trozo runs only on the author's laptop today. The chunk service is on Fly (007), but nothing public talks to it. 008 puts the translator on a real URL, `trozoapp.com`, so the author can use it from any device. The site sits behind a login only the author can pass.

The product has no app-level auth (an OVERVIEW non-goal), and ARCHITECTURE's constraint still applies: anyone who reaches the app could spend LLM credit and read or delete saved chunks. Fly serves every app on a public `*.fly.dev` hostname, so the login must hold there too. 006's Access check covers that once 008 provides the Access values.

### Consumer Impact <!-- required -->

- **The author, as single user:**
  - opens `https://trozoapp.com` on any device and signs in once with an emailed one-time code (a session lasts 30 days);
  - uses the translator, saved chunks and Anki export against the production database;
  - after a quiet spell, the first page load resumes the web app (about 1 s), and the first translation also resumes the chunker (about 1 s) and wakes Neon.
- **The author, as operator:** has one documented deploy command for the web app. Migrations run on Neon automatically before a release takes traffic, and there's a checklist for the Cloudflare side.
- **Portfolio reviewers:** unaffected. Access admits only the author, and the README metrics stay the public artefact.
- **Integration points:**
  - Cloudflare's proxy forwards `Cf-Access-Jwt-Assertion`. 006's middleware verifies it against `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD`.
  - The web app calls `http://trozo-chunker.flycast` with `CHUNKER_TOKEN` (007).
  - The web app reaches Neon's pooled endpoint through `DATABASE_URL`.
  - Fly's `release_command` runs `node migrate.mjs` (006).

### Roadmap Fit <!-- required -->

- **Depends on:**
  - 006: the Access middleware, `migrate.mjs`, `/healthz`, the Neon connection settings;
  - 007: the private chunker, its Flycast address and the shared token.
- **Last manual step of the production setup.** 009 automates what 008 does by hand (deploy on merge, migrations first) and adds per-PR previews, so 008's deploy command and checklist become 009's inputs.

---

## What <!-- required -->

### Acceptance Criteria <!-- required -->

Using the app, written as the author:

- [ ] Visiting `https://trozoapp.com` in a fresh browser shows the Cloudflare Access login. After entering `adrian@thesolo.dev` and the emailed code, the translator loads.
- [ ] Any other email address is refused by Access.
- [ ] Signed in, the author can:
  - translate a phrase (a seed phrase shows a "verified" chunk, and full confidence settles);
  - save a chunk, and see it on `/saved`;
  - export the Anki Basic, Anki Cloze and TXT files.
- [ ] Saved chunks live in Neon's production branch.
- [ ] `https://www.trozoapp.com` redirects to `https://trozoapp.com`.
- [ ] The Access session lasts 30 days.

Protection, written as the author:

- [ ] `https://trozo-web.fly.dev/` returns 403, as does a server function or `/api/export` there. `https://trozo-web.fly.dev/healthz` returns 200.
- [ ] A request to `trozoapp.com` with a forged or expired `Cf-Access-Jwt-Assertion` doesn't reach the app. Access stops it at the edge, and the app would return 403 anyway.
- [ ] `trozoapp.com` is served over HTTPS end to end: Cloudflare runs SSL mode Full (strict), and Fly holds a valid certificate for `trozoapp.com`.

Operations, written as the operator:

- [ ] The Fly app `trozo-web` runs in `fra` from `apps/web/Dockerfile`, deployed from the repo root with one documented command.
- [ ] Every deploy runs `node migrate.mjs` as Fly's `release_command` against Neon. A failed migration fails the deploy, and the previous release keeps serving.
- [ ] `CHUNKER_URL` and `CF_ACCESS_TEAM_DOMAIN` are plain config in `fly.toml`. `DATABASE_URL`, `CHUNKER_TOKEN` and `CF_ACCESS_AUD` are Fly secrets. None of them is in the repo.
- [ ] The web app suspends when idle and resumes on the next request. Resume time and the web VM's peak memory are measured, and the VM size follows from the measurement.
- [ ] Fly's health check on `/healthz` passes.
- [ ] DEPLOY.md has the web deploy steps and a Cloudflare checklist (DNS, SSL mode, certificate, `www` redirect, Access app and policy), with nothing left as "planned".
- [ ] ARCHITECTURE and OVERVIEW describe production as live, not planned.

### Non-Goals <!-- required -->

- **No CI, deploy on merge, preview apps or LLM spend limits** (009).
- **No landing page or portfolio page** on the domain. Everything on `trozoapp.com` is behind Access.
- **No multi-region deployment and no second web machine** beyond what Fly needs for a release.
- **No app-level auth, user accounts or identity from the Access JWT** (OVERVIEW non-goal).
- **No email sending, analytics or monitoring beyond Fly's logs and metrics** (logs and `meta.dropped` belong to 009).
- **No code changes to the Access check, migrate script or chunker**, unless validation finds a defect. Any such change is recorded as a divergence.

### Open Questions <!-- optional -->

- **Neon's `channel_binding=require` with node-postgres.** Neon's default connection string includes it, and pg may reject or ignore it. **Resolved by validation step 1.** If pg can't handle it, drop the parameter and keep `sslmode=verify-full`, and DEPLOY.md records the exact URL shape.
- **`www` redirect and Access ordering.** If Cloudflare's redirect runs after Access, a visitor to `www` sees the login first. That's acceptable either way, but the Access app then needs to cover `www` too. **Resolved during validation.**
- **Zero Trust team name.** The author picks it when enabling Zero Trust (it becomes `<team>.cloudflareaccess.com`), and it's recorded in `fly.toml`.

---

## How <!-- required -->

### Approach <!-- required -->

1. **Validate Neon first** (see Confidence): run the bundled `migrate.mjs` locally against Neon's pooled URL. The author supplies it through a `!` command, so the URL isn't printed in the conversation.
2. **`apps/web/fly.toml`:**
   - `app = "trozo-web"`, `primary_region = "fra"`;
   - `[build] dockerfile = "Dockerfile"`, deployed with `fly deploy . --config apps/web/fly.toml` from the repo root;
   - `[deploy] release_command = "node migrate.mjs"`;
   - `[env]`: `CHUNKER_URL = "http://trozo-chunker.flycast"` and `CF_ACCESS_TEAM_DOMAIN = "<team>.cloudflareaccess.com"`;
   - `[http_service]`: `internal_port = 3000`, `force_https = true`, `auto_stop_machines = "suspend"`, `auto_start_machines = true`, `min_machines_running = 0`, with an HTTP check on `/healthz`;
   - `[[vm]]` shared-cpu-1x, 512 MB to start.
3. **Fly app and secrets:**
   - `fly apps create trozo-web --org personal`.
   - The agent stages `CHUNKER_TOKEN` (007's value).
   - The author stages `DATABASE_URL`: Neon pooled, `sslmode=verify-full`.
   - `CF_ACCESS_AUD` is staged once the Access app exists (step 5).
   - Until it is set, the app correctly returns 503 (006's fail-closed check), so the first deploy can go out before Access is ready.
4. **Deploy and IPs:**
   - `fly deploy . --config apps/web/fly.toml --ha=false`.
   - Allocate public IPs (shared IPv4 and dedicated IPv6) for Cloudflare to reach.
   - Check that the release step ran migrations on Neon (`saved_chunks` exists).
5. **Cloudflare**, done by the author from a DEPLOY.md checklist:
   - **DNS:** proxied `A` and `AAAA` records for `trozoapp.com` pointing at the Fly IPs, and a proxied `www` record.
   - **Certificate:** `fly certs add trozoapp.com`, plus the `_acme-challenge` CNAME Fly asks for, so the certificate issues through DNS validation behind the proxy.
   - **SSL mode:** Full (strict).
   - **Redirect:** a rule sending `www.trozoapp.com/*` to `https://trozoapp.com/$1` (301).
   - **Zero Trust:** choose the team name, then create a self-hosted Access application for `trozoapp.com` (and `www` if needed). The policy allows only the email `adrian@thesolo.dev`, login is by one-time PIN, and the session lasts 30 days. Copy the application's AUD tag.
   - **Fly:** `fly secrets set CF_ACCESS_AUD=… -a trozo-web`, which redeploys. Set `CF_ACCESS_TEAM_DOMAIN` in `fly.toml`.
6. **End-to-end check:** in a fresh browser, run the Access login, translate, save, `/saved` and all three exports. Check `trozo-web.fly.dev` (403, with `/healthz` 200) and a forged token.
7. **Measure:** web peak RSS during SSR and export (`fly ssh console` and `/proc`), and resume time from suspended. Resize the VM if there's room.
8. **Docs:** DEPLOY.md (web steps, Cloudflare checklist, URL shape); ARCHITECTURE and OVERVIEW changed from "planned" to live; README gets the production URL and a note that it's private.

### Confidence <!-- required -->

**Level:** Medium

**Rationale:**

- **Well understood:** the image, the Access middleware, the migrate script and the chunker are built and tested (006, 007), and the Fly steps mirror 007.
- **Uncertain:**
  - how Neon's connection string parameters behave with node-postgres;
  - Fly certificate issuance while Cloudflare's proxy is in front;
  - how the `www` redirect orders against Access.

  Each could cost a detour, but none should change the design.

**Validate before proceeding:**

1. With the author's pooled Neon URL: `DATABASE_URL=… node apps/web/dist/migrate.mjs` applies `saved_chunks` on Neon and re-runs as a no-op. If `channel_binding` breaks it, adjust the URL shape.
2. After the first deploy, with DNS proxied, `fly certs show trozoapp.com` reaches "Ready" through the `_acme-challenge` record before SSL mode is switched to Full (strict).
3. Once Access is on, `curl -I https://trozoapp.com` without a session redirects to `<team>.cloudflareaccess.com`, and a signed-in browser loads the app. The latter proves the header reaches Fly and verifies.

### Key Decisions <!-- optional -->

- **The app lives on the bare domain**, with `www` redirecting to it (the author's choice).
- **Login by email one-time code**, allowing only the author's address (the author's choice). There's no identity provider to set up.
- **The web app suspends when idle** (the author's choice), for near-zero idle cost. A cold first request wakes up to three things in sequence: web, chunker and Neon.
- **The author does the Cloudflare dashboard steps from a checklist.** They are account settings, so the agent doesn't change them without step-by-step permission.
- **Deploy before Access exists.** 006's fail-closed check means the app is never open while `CF_ACCESS_AUD` is missing: it returns 503.

### Testing Approach <!-- required -->

- **Existing suites** (web Vitest, chunker pytest) stay green. 008 changes no code unless validation finds a defect.
- **Validation steps 1–3** above, with output recorded in the decision record.
- **Production end-to-end** (manual, recorded):
  - the Access login;
  - a seed phrase showing "verified", with full confidence settling;
  - save, then `/saved`;
  - Anki Basic, Anki Cloze and TXT exports;
  - the `www` redirect.
- **Protection checks** (curl, recorded):
  - `trozo-web.fly.dev` `/`, `/api/export` and a server-function path all return 403, and `/healthz` returns 200;
  - `trozoapp.com` without a session redirects to the Access login;
  - a forged `Cf-Access-Jwt-Assertion` sent to `trozo-web.fly.dev` returns 403.
- **Release checks:** the first deploy's release step logs `[migrate] done` against Neon, and a second deploy's release is a no-op.
- **Measurements:** web peak RSS, resume time and final VM size, all recorded.
