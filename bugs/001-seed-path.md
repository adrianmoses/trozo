# Bug Fix: Seed index empty outside Docker

| Field            | Value                                                                 |
| ---------------- | --------------------------------------------------------------------- |
| id               | 001                                                                   |
| status           | fixed                                                                 |
| created          | 2026-09-25                                                            |
| reporter         | agent                                                                 |
| environment      | local (uvicorn, `pnpm dev:all`, eval runs); Docker Compose unaffected |
| affected-feature | 001 seed v0 + chunk service (fast confidence); visible in 002 and 003 |

---

## Context <!-- required -->

Found while writing the 003 decision record. In a live smoke test, _echar de menos_ for "I miss you" at ES came back with `signals.seed = false` and label `unrated`, although `evals/seed/seed_v0.yaml` lists _echar de menos_ for ES. Expected: `high` ("verified"), per the fast-confidence rule "seed match on chunk and region → high".

Reproduction, from `services/chunker` with no `CHUNKER_SEED_PATH` set:

```
DEFAULT_SEED_PATH = /Users/adrianmoses/Developer/trozo/services/evals/seed/seed_v0.yaml exists: False
index size = 0
surface 'echar de menos' regions ['ES'] key 'echar de menos' seed regions None
```

The lemma key matched the seed key exactly; the index itself was empty.

---

## Problem Scope <!-- required -->

### Root Cause <!-- required -->

`DEFAULT_SEED_PATH` in `services/chunker/app/pipeline/seed.py` climbed `parents[3]` from `app/pipeline/seed.py`, which is `services/`, not the repo root, so it pointed at a file that does not exist; `load_seed_index` then silently returned an empty index. Only `docker-compose.yml` sets `CHUNKER_SEED_PATH`, and the test fixture always sets it too, so neither Docker nor the test suite ever used the default.

### Blast Radius <!-- required -->

**Severity:** High

- **Fast confidence was a no-op locally since 001.** No chunk could ever be "verified" outside Docker: 0 of 20 dev chunks in the last pre-fix fast run; all 73 locally cached responses carried `seed: false` on all 267 chunks and alternatives.
- **Every local eval and smoke run for 001–003** lacked the seed signal. Recall and calque rate are unaffected (they do not use confidence). 003's calibration metrics are unaffected because they mask the seed rule on purpose (confirmed below: identical before and after).
- **The 001 and 002 decision records' fast-confidence claims** rested on unit tests with an explicit seed path; the behaviour was never seen live until this fix.
- **Cached responses were poisoned, not just new ones.** Both fast and full cache entries stored `seed: false`, so correcting the path alone would not have fixed anything already cached.
- **Docker Compose was unaffected** (it sets the path explicitly). No data loss; nothing is persisted beyond the local disk cache.

High rather than Critical: the core product (chunks, examples, traps) worked; the "verified" label, a headline part of confidence, silently never appeared in the environment where all development and evaluation happened.

### Spec Gap <!-- optional -->

001's spec required "fast confidence works: seed match → high", but its testing approach only covered `fast_confidence` with an injected index and the endpoint with a fixture-set path. Nothing asserted that the default configuration loads a non-empty seed. More generally, a missing seed file is silently treated as "no seed"; a revision could make a missing default path a startup error. Candidate for a small follow-up, not done here.

---

## Fix Applied <!-- required -->

### What Changed <!-- required -->

1. **Path corrected** (`app/pipeline/seed.py`): `parents[3]` → `parents[4]`, with a comment spelling out the directory chain. This fixes the root cause for every new response.
2. **Seed signal recomputed on read** (`app/pipeline/confidence.py` `refresh_seed`, called from `app/main.py` on fast and full cache hits). Fast labels are seed-only, so a cached fast response gets `high` or `unrated` from the current seed; a cached full response gets its `seed` signal updated and is then relabelled from its stored signals (the relabel-on-read mechanism from 003). This repairs the 73 stale cache entries without eviction or new LLM calls, and keeps cached responses correct when 005 grows the seed.
3. `seed_matches()` extracted from `fast_confidence` so the fresh-response and on-read paths share one rule.

Recomputing on read costs one lemmatisation per chunk and alternative per request (about 10 short strings), which is negligible next to an LLM call, and needs no cache write.

### Test Cases Added <!-- required -->

Written before the fix; all four failed before and pass after.

- `test_seed_confidence.py::test_default_seed_path_points_at_the_repo_seed_file`: the default path resolves to `<repo>/evals/seed/seed_v0.yaml` and the file exists.
- `test_seed_confidence.py::test_seed_index_loads_without_env_override`: with `CHUNKER_SEED_PATH` unset, the index is non-empty and has _echar de menos_ for ES.
- `test_api.py::test_cached_fast_payload_picks_up_the_current_seed`: a fast response cached with an empty seed becomes `high`/`seed: true` once the seed lists the chunk, with no new LLM call.
- `test_full.py::test_cached_full_payload_picks_up_the_current_seed`: a full response cached as `low` becomes `high` with `seed: true` once the seed lists the chunk, with no new LLM or verifier calls.

### Test Evidence <!-- required -->

Before the fix:

```
FAILED tests/test_api.py::test_cached_fast_payload_picks_up_the_current_seed
FAILED tests/test_full.py::test_cached_full_payload_picks_up_the_current_seed
FAILED tests/test_seed_confidence.py::test_default_seed_path_points_at_the_repo_seed_file
FAILED tests/test_seed_confidence.py::test_seed_index_loads_without_env_override
4 failed, 68 deselected in 0.89s
```

After the fix:

```
=== AFTER the fix: new tests ===
....                                                                     [100%]
4 passed, 68 deselected in 0.63s
=== full suite ===
........................................................................ [100%]
72 passed in 2.00s
```

Live, against the existing local cache:

```
fast cached=True [('echar de menos', 'high', True)]
full cached=False [('echar de menos', 'high', True)]

before fix (20260925T160200Z-p1-dev-fast.jsonl): fast-mode verified chunks 0/20
20260925T213811Z-p1-dev-fast.jsonl: fast-mode verified chunks 13/20
20260925T213811Z-p1-test-fast.jsonl: fast-mode verified chunks 14/24
```

Eval regression (recall, calque rate and 003's seed-masked metrics unchanged):

```
== fast dev ==   items: 15  chunk recall: 0.98  calque rate: 0.00
== fast test ==  items: 15  chunk recall: 1.00  calque rate: 0.00
== full dev ==
items: 15  chunk recall: 0.98  calque rate: 0.00
chunks: n=20  high precision (seed masked): 1.00  coverage: 0.65  base rate: 0.70  verifier agree: 0.70
alternatives: n=30  high precision (seed masked): 0.54  coverage: 0.43  base rate: 0.27  verifier agree: 0.80
== full test ==
items: 15  chunk recall: 1.00  calque rate: 0.00
chunks: n=24  high precision (seed masked): 0.62  coverage: 0.67  base rate: 0.54  verifier agree: 0.75
alternatives: n=39  high precision (seed masked): 0.67  coverage: 0.23  base rate: 0.28  verifier agree: 0.72
```
