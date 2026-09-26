# Bug Fix: Chunker container crashes on import

| Field            | Value                                                                             |
| ---------------- | --------------------------------------------------------------------------------- |
| id               | 002                                                                               |
| status           | fixed                                                                             |
| created          | 2026-09-26                                                                        |
| reporter         | agent                                                                             |
| environment      | Docker Compose (`docker compose up`); the chunker image. Local uvicorn unaffected |
| affected-feature | 001 seed v0 + chunk service; regression from the [bug 001](001-seed-path.md) fix  |

---

## Context <!-- required -->

Found while verifying feature 004 end to end. `docker compose up --build` started Postgres, `migrate` and `web`, but `chunker` exited with code 1:

```
chunker-1  |   File "/app/app/pipeline/seed.py", line 13, in <module>
chunker-1  |     DEFAULT_SEED_PATH = Path(__file__).parents[4] / "evals" / "seed" / "seed_v0.yaml"
chunker-1  |                         ~~~~~~~~~~~~~~~~~~~~~~^^^
chunker-1  | IndexError: 4
```

Expected: the service starts and loads the seed from `CHUNKER_SEED_PATH`, which Compose sets to `/app/seed/seed_v0.yaml`.

Reproduced in a fresh image. The module path has only four parents, and the env override is set but never reached:

```
$ docker compose run --rm --no-deps chunker uv run --no-sync python -c "..."
['/app/app/pipeline', '/app/app', '/app', '/']
CHUNKER_SEED_PATH= /app/seed/seed_v0.yaml
IndexError: 4
```

---

## Problem Scope <!-- required -->

### Root Cause <!-- required -->

`app/pipeline/seed.py` computed the default seed path at import time as `Path(__file__).parents[4]`. That index assumes the repo layout (`services/chunker/app/pipeline/seed.py`). The image copies `app/` to `/app/app/`, where the module has only four parents, so importing it raised `IndexError` before `load_seed_index()` could read `CHUNKER_SEED_PATH`.

The bug 001 fix changed the index from `[3]` to `[4]`. `parents[3]` happened to exist in the image (`/`), which is why the image worked before that fix.

### Blast Radius <!-- required -->

**Severity:** High

- **Docker Compose / any image-based deploy:** the chunk service did not start at all since the bug 001 fix (`065ff77`, merged with PR #4 on 2026-09-25). With Compose, the web app came up but every chunk request failed with a network error. That breaks the one-command demo OVERVIEW promises and the Fly.io/Railway-style deploy path.
- **Local development** (`pnpm dev:all`, uvicorn, evals, pytest) was unaffected: in the repo, `parents[4]` exists and is the repo root.
- **No data risk:** the chunker holds no user data. The disk cache is untouched because the process never started.
- Not rated Critical because the local workflow, which is where development and evals run, kept working.

### Spec Gap <!-- optional -->

- **The bug 001 record was too confident about Docker.** It said "Docker Compose unaffected", but its fix was only tested in the repo layout. Neither its tests nor the suite ran anything in the image layout, and no check starts the container. `ARCHITECTURE.md` names Docker Compose and an image-based host as the deploy path, so the image layout is a supported environment. A container smoke check (build, start, `GET /v1/health`) is a candidate for CI.
- **Fragile repo-relative paths:** the dev scripts in `services/chunker/scripts/` also use `parents[N]`, but they aren't copied into the image, so they're out of scope here.

---

## Fix Applied <!-- required -->

### What Changed <!-- required -->

`services/chunker/app/pipeline/seed.py`:

- **Constant replaced by a function.** `DEFAULT_SEED_PATH` (computed at import) is now `default_seed_path(module_file=None) -> Path | None`. It returns the repo seed path when the module sits in the repo layout (more than four parents), and `None` otherwise. Nothing is resolved at import time, so a shallow install can no longer crash on import.
- **Env override read first.** `load_seed_index()` now checks `CHUNKER_SEED_PATH` before the default. With neither available, it returns an empty index, as it already did for a missing file.

This fixes the cause, the import-time assumption about directory depth, rather than catching the `IndexError`. The repo-layout default from bug 001 is unchanged, and the image relies on the env path Compose already sets.

`services/chunker/tests/test_seed_confidence.py`: bug 001's default-path test now calls `default_seed_path()` instead of importing the removed constant.

### Test Cases Added <!-- required -->

Written before the fix; all failed before it (the old module had no `default_seed_path`, and its constant could not be tested for another layout without crashing the import):

- `test_default_seed_path_is_none_in_the_image_layout`: for `/app/app/pipeline/seed.py` (the image layout), resolving the default returns `None` instead of raising.
- `test_seed_index_uses_env_path_when_no_repo_default`: with no repo default, the index loads from `CHUNKER_SEED_PATH` (_echar de menos_ → `{ES}`).
- `test_seed_index_is_empty_without_env_or_repo_default`: with neither, the index is empty and nothing raises.
- `test_default_seed_path_points_at_the_repo_seed_file` (from bug 001, updated): the repo-layout default still resolves to `<repo>/evals/seed/seed_v0.yaml`.

### Test Evidence <!-- required -->

Before the fix (new and updated tests):

```
FAILED tests/test_seed_confidence.py::test_default_seed_path_points_at_the_repo_seed_file
FAILED tests/test_seed_confidence.py::test_default_seed_path_is_none_in_the_image_layout
FAILED tests/test_seed_confidence.py::test_seed_index_uses_env_path_when_no_repo_default
FAILED tests/test_seed_confidence.py::test_seed_index_is_empty_without_env_or_repo_default
4 failed, 5 passed in 0.83s
```

After the fix:

```
tests/test_seed_confidence.py::test_seed_match_chunk_and_region_high PASSED
tests/test_seed_confidence.py::test_seed_match_wrong_region_unrated PASSED
tests/test_seed_confidence.py::test_no_seed_match_unrated PASSED
tests/test_seed_confidence.py::test_seed_match_with_optional_word_high PASSED
tests/test_seed_confidence.py::test_default_seed_path_points_at_the_repo_seed_file PASSED
tests/test_seed_confidence.py::test_seed_index_loads_without_env_override PASSED
tests/test_seed_confidence.py::test_default_seed_path_is_none_in_the_image_layout PASSED
tests/test_seed_confidence.py::test_seed_index_uses_env_path_when_no_repo_default PASSED
tests/test_seed_confidence.py::test_seed_index_is_empty_without_env_or_repo_default PASSED
============================== 9 passed in 0.51s ===============================

$ uv run pytest -q          # services/chunker
75 passed in 1.86s
$ uv run ruff check app tests
All checks passed!
```

In the rebuilt image (`docker compose up -d --build chunker`), the container runs, reports healthy, and loads the seed from the env path. A live fast request shows the seed signal:

```
chunker running
{"status":"ok"}
default_seed_path: None
seed entries: 44
echar de menos regions: ['ES']

POST /v1/chunk {"text":"I miss you","preferred_region":"ES","confidence_mode":"fast"}
echar de menos high seed= True
```
