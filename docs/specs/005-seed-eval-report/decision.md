# Decision Record: Seed to 120 + Eval Report

| Field   | Value                |
| ------- | -------------------- |
| id      | 005                  |
| status  | implemented          |
| created | 2026-09-27           |
| spec    | [spec.md](./spec.md) |

---

## Context <!-- required -->

The harness from 001 and 003 worked, but it measured against a small answer key that was partly wrong. There were 30 items, one answer per chunk, and region tags were never scored. 005 was specced at **Medium** confidence, with a validation gate before writing about 90 items. During planning, the human chose that the agent drafts the items in tier batches and the author reviews each one. `reference:` is claimed only where an entry was actually read, and native checks are reported as they stand without blocking the work.

Five things found during implementation shaped the result:

- **The validation gate passed, but showed the key was a bigger problem than the spec assumed.** Re-scoring 003's stored runs gave region precision around 0.89, so the region metric can show errors. Test high-label precision went from 0.62 to 1.00 once valid alternatives counted. Four of 003's six "wrong" `high` chunks were not alternative forms of an expected chunk but **other valid chunks** for the phrase (_me gusta_, _por mí_, _está bien_, _trabajo_), so `accepted:` alone could not explain the gap.
- **Keys written after a model run are circular.** The alternatives added to the original 30 items came from the model's own outputs. From then on the rule was "key before model": every new item was keyed before any model saw it, and later additions go to [`seed/KEY_CHANGES.md`](../../../evals/seed/KEY_CHANGES.md).
- **The DLE blocks automated reads (HTTP 403).** Spanish Wiktionary's API worked, under heavy rate limiting, and gave `{{ámbito}}` regional marks. It confirmed some tags and corrected others: _plata_ is marked for all of Latin America, and Colombia says _andén_ for sidewalk, not _acera_.
- **The evals found a service bug before they could judge the prompt.** p2's coverage rule appeared to do nothing, because the chunks it asked for were generated and then dropped by the validator. That was [bug 003](../../../bugs/003-validator-drops-valid-chunks.md): 7% of the seed's forms were rejected even when present word for word. 005 paused, the bug was fixed on its own branch and merged, and every run was repeated on fresh (uncached) generations.
- **Default sampling makes single items unstable.** p2 dev iterations 2 and 3 differed by 2–3 items on unchanged rules. At 60 items per split, differences of one to three items are within run-to-run noise.

Work was done on `feature/005-seed-eval-report`; not yet merged.

## Decision <!-- required -->

**Seed.** The seed is now `seed_v1.yaml`, 120 items: 36 simple, 36 regional, 30 advanced, 18 calque, each tier split evenly between dev and test (18/18, 18/18, 15/15, 9/9). The original 30 keep their splits. Every item records `checked:`. All 120 are author-reviewed, 28 also cite a reference (DLE or Wiktionary), and none has a native check yet. The regional tier includes neutral-only forms used everywhere, so over-tagging can be measured.

**Answer-key format.** Two additions to the spec's format:

- `accepted:` entries can carry their own regions;
- a new item-level `also_valid:` list holds other valid chunks, which count as correct and are scored for region but are not required for recall.

The chunk service's seed index reads neither, so fast-mode "verified" labels are unchanged (spec Open Question 1).

**Metrics.** Every run now reports region precision and an over-tagging rate. Chunks and alternatives the seed doesn't list are excluded from region scoring, and the report says how many were excluded (spec Open Question 2, resolved as proposed). `rescore.py` re-scores any stored run offline. The report includes the check-method mix per tier.

**Thresholds** stay at T_high 1.0 and T_med 0.6, re-checked on the new dev split after the bug fix.

**p2 targeted recall, the weakest p1 metric, and is not adopted.** p2 adds:

- a stricter unconjugated-surface rule;
- coverage rules: the pattern carrying the meaning, and the correct form a note points to, must be chunks;
- a region guardrail.

On test it raised recall from 0.83 to 0.87. The calque rate (0.00 → 0.02), over-tagging (0.05 → 0.07) and chunk high precision (0.83 → 0.80) got worse by one to three items each. The adoption rule, set in the spec before the run, requires no other headline metric to get worse, so p1 stays the default and p2 is kept in `prompts/` as a documented experiment.

**The README** reports p1 against p2 on test, the check-method mix, and the before/after story, including the bug and the answer-key finding.

---

## Alternatives Considered <!-- required -->

### How to credit valid answers the seed does not expect

**Option A: `accepted:` per expected chunk only (the spec).**

- Pros: one small format change.
- Cons: it can't express other valid chunks for the phrase, which were most of 003's "errors". An accepted form also inherited the primary's regions, which mis-scores _autobús_ accepted for _camión_ [MX].

**Option B: add the extra chunks to `expected_chunks`.**

- Pros: no new field.
- Cons: recall then demands chunks nobody required. The service's seed index would also start marking them fast-mode "verified", which Open Question 1 ruled out.

**Option C: `accepted:` with optional regions, plus an item-level `also_valid:` the service never reads.**

- Pros: fixes both problems. The product's labels don't change, and recall still means "the required chunks were found".
- Cons: two concepts for seed authors to learn.

**Chosen:** C. A first version used `optional: true` inside `expected_chunks`. It was moved to `also_valid:` once it turned out `build_index` would index it.

### Who writes and checks ~90 items

**Option A: the agent drafts, the author reviews each batch.** **Option B: the agent drafts, and references are trusted without review.** **Option C: the author writes them.**

**Chosen:** A, the human's choice. B would make the answer key model-written. C was the slowest option for the author.

### Reference source for regional tags

**Option A: DLE**, the planned source. It returned HTTP 403 to both WebFetch and curl.

**Option B: Spanish Wiktionary API**, with `{{ámbito}}` marks. Readable, but rate-limited (429 after about 10 requests, so it was run slowly in the background).

**Option C: no reference; the author's review only.**

**Chosen:** B where readable, with `reference:Wiktionary` only on the four items where every regional form was confirmed (straw, beans, kids, beer). The other findings go into each item's `source` text.

### What to do when the validator bug surfaced mid-feature

**Option A: fix first, in a separate branch (bug 003), then re-run everything uncached.**

- Pros: the product stops dropping chunks, and p2's coverage rule becomes measurable.
- Cons: about 1,440 more LLM calls, and the phase order broke.

**Option B: continue with the bug in place.**

- Pros: the comparison stays fair, since both prompts share the validator; it's cheaper.
- Cons: recall is understated and p2 can't be judged on its own target.

**Chosen:** A, the human's choice. The fix raised p1 dev recall from 0.85 to 0.92, more than the prompt change did.

### p2's target

**Option A: recall and chunk rules.** **Option B: region tagging (over-tagging, mixed `neutral` + country tags).**

**Chosen:** A, the human's choice, from the baseline. Every dev miss broke a rule p1 already states. In the third dev iteration a region guardrail (from B) was added, because p2's extra chunks exposed more neutral forms to over-tag. Without it, the adoption rule would have failed on over-tagging even on dev. On test, over-tagging still rose by two items.

### Adopting p2

**Option A: adopt, since recall improved and the other differences are noise.** **Option B: keep p1, as the pre-agreed rule requires.**

**Chosen:** B. The spec set the rule before any test run, to keep the comparison honest. Relaxing it after seeing the numbers would defeat the point. The calque (_factura_ offered as an alternative for "the bill") is a real error, not noise.

---

## Tradeoffs <!-- required -->

- **The key is broader but more generous.** `also_valid:` and `accepted:` raise measured precision and cut unmatched entries. A lenient key can hide real errors, which is why the original 30 items' post-run additions are logged and reported separately, and why new items were keyed before any model saw them.
- **Author checks, not native ones.** All 120 items rest on the author's review, with references for 28. The README says so instead of claiming native coverage.
- **Small splits.** 60 test items can't separate differences of one to three items. p2's recall gain is the right direction, but not proven.
- **The matcher is still lenient.** Its containment match, which works in both directions and doesn't lemmatize, gives generous credit on short or generic expectations (_ser en_, _buscar_). Parity with the service matcher stayed a non-goal.
- **Reproducibility is local.** Numbers reproduce from the disk cache (60/60 cached on re-run). A fresh clone regenerates with new LLM calls and default sampling, so its numbers will vary somewhat. `evals/reports/005/` is the durable evidence.
- **p2 is kept but unused.** It stays in `prompts/` as a reference for the next prompt iteration, at the cost of one unused prompt file.

---

### Spec Divergence <!-- optional -->

| Spec Said                                                          | What Was Built                                                                                                                                            | Reason                                                                                                                            |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `accepted:` alternatives per expected chunk                        | `accepted:` entries may be `{surface, regions}`, plus an item-level `also_valid:` list                                                                    | Accepted forms can have different regions, and most of 003's gap was other valid chunks, not alternative forms (see Alternatives) |
| `checked:` values `native:`/`reference:`/`author`                  | As specified; references are DLE (the original 30) and Spanish Wiktionary (new items)                                                                     | DLE blocks automated reads                                                                                                        |
| Approach order: baseline → re-tune → p2 → report                   | Baseline → p2 iteration 1 → **bug 003 fix** → baseline re-run (uncached) → p2 iterations 2–3 → test                                                       | The validator dropped chunks p2 asked for; the human chose to fix it first                                                        |
| p2 iterated on dev, at most about 3 runs                           | 3 dev runs (one before the bug fix); iterations 2 and 3 each used their own cache directory                                                               | Editing a prompt in place doesn't invalidate the cache, so a stale iteration could otherwise be served                            |
| p2 targets the weakest metric (recall)                             | Recall rules plus a region guardrail added in iteration 3                                                                                                 | To avoid breaking the adoption rule on over-tagging; the target stayed recall                                                     |
| Re-score the 30-item baseline and state the 003 gap                | Done with a new `rescore.py` and three key states (primary only, full key, and the new keyed-before-model items)                                          | Separates key effects from model effects, and records that the 30-item "full key" 1.00 is post-hoc                                |
| The service changes only by `p2.md` and possibly `DEFAULT_VERSION` | `default_seed_path` points at `seed_v1.yaml`, and Compose's `CHUNKER_SEED_PATH` too (spec Approach 2). Bug 003 changed the service separately (own PR #8) | Seed rename; the bug was fixed outside this feature                                                                               |
| README lists the commands; re-running hits the cache               | Done; `evals/results/` stays gitignored, and final reports are copied to a tracked `evals/reports/005/`                                                   | Results were never tracked, so reports need a durable home                                                                        |
| Test coverage in the Testing Approach                              | As specified, plus a note-kind enum check and a whole-seed `build_index` load test                                                                        | Cheap guards found useful while authoring                                                                                         |

Everything else matches the spec:

- tier shares and splits;
- the region and over-tagging metrics and their placement in the report;
- deltas kept on existing metrics;
- thresholds re-tuned (and unchanged) with the sweep as evidence;
- a single test run for p2, reported in full;
- the adoption rule applied;
- no new regions, no web changes, no CI, no LLM-judge, no model swap.

**The acceptance criterion "native-checked regional items"** (ROADMAP wording) is honestly unmet: no native checks came in, which the spec allowed ("Native checks don't block 005"), and the README says so.

---

## Spec Gaps Exposed <!-- optional -->

- **Matcher gaps remain.** Stem-changing verbs don't match (_devuelvo_ vs _devolver_; the verb-stem prefix is _devolv_), and neither does _contigo_ vs _con_. Both are now visible through `meta.dropped`. It's a candidate bug 004.
- **Drop rate is not an eval metric.** `meta.dropped` exists (bug 003), but the runner doesn't report it: 2 drops on p1 test, 4 on p2 test. It's worth adding next to recall so a matcher regression can't hide again.
- **The spec's adoption rule is binary on small splits.** A rule with no-regression tolerance, for example "not worse by more than N items", or repeated runs, would suit 60-item splits better. The next prompt-change spec should decide this before running.
- **Default sampling means runs aren't repeatable at item level.** Evals reproduce only from cache. Reporting mean ± spread over repeated runs would cost several times the calls.
- **ARCHITECTURE's open decisions are resolved:**
  - thresholds re-tuned on the 120-item seed;
  - accepted variants added;
  - over-tagging measured.

  Updated alongside this record.

- **OVERVIEW's open question on bare fragments** ("to look forward to") is still open. 005's look-forward-01 accepts either _tener ganas de_ or _esperar con ganas_.

---

## Test Evidence <!-- required -->

Suites on `feature/005-seed-eval-report` (2026-09-27):

```
$ cd evals && uv run pytest -v
tests/test_scoring.py::test_expected_match_accepts_primary_and_accepted_forms PASSED
tests/test_scoring.py::test_accepted_alternative_counts_for_recall PASSED
tests/test_scoring.py::test_without_accepted_the_same_output_is_a_miss PASSED
tests/test_scoring.py::test_accepted_alternative_counts_as_correct_for_confidence PASSED
tests/test_scoring.py::test_region_precision_counts_correct_extra_and_wrong_tags PASSED
tests/test_scoring.py::test_unmatched_entries_are_excluded_and_counted PASSED
tests/test_scoring.py::test_missing_regions_default_to_neutral PASSED
tests/test_scoring.py::test_country_tag_on_a_neutral_only_form_is_over_tagging PASSED
tests/test_scoring.py::test_neutral_tag_on_a_neutral_only_form_is_not_over_tagging PASSED
tests/test_scoring.py::test_country_tag_on_a_regional_expectation_is_not_an_over_tagging_target PASSED
tests/test_scoring.py::test_check_mix_counts_methods_per_tier PASSED
tests/test_scoring.py::test_accepted_form_is_scored_against_its_own_regions PASSED
tests/test_scoring.py::test_also_valid_chunk_is_not_required_for_recall_but_counts_as_correct PASSED
tests/test_seed.py::test_required_fields_and_values PASSED
tests/test_seed.py::test_regions_are_the_launch_set PASSED
tests/test_seed.py::test_ids_and_inputs_are_unique PASSED
tests/test_seed.py::test_few_shot_inputs_are_in_dev PASSED
tests/test_seed.py::test_final_shape_tiers_splits_and_checks PASSED
tests/test_seed.py::test_there_are_neutral_only_forms_for_over_tagging PASSED
tests/test_seed.py::test_note_kinds_are_the_service_enum PASSED
============================== 20 passed in 0.25s ==============================

$ cd services/chunker && uv run pytest -q     # incl. build_index ignores accepted/also_valid/checked
86 passed in 3.72s
$ uv run ruff check app tests
All checks passed!
$ pnpm --filter web test
      Tests  118 passed | 6 skipped (124)
$ npx prettier --check .
All matched files use Prettier code style!
```

Validation gate: 003's stored runs re-scored, no LLM calls:

```
== test --primary-only     (as scored in 003)
region precision: 0.89 (27 tags)  over-tagging: 0.12 (2/16)  unmatched excluded: 39/63
chunks: n=24  high precision (seed masked): 0.62  ...
alternatives: n=39  high precision (seed masked): 0.67  ...
== test full-key           (accepted + also_valid, added after seeing this run)
region precision: 0.89 (66 tags)  over-tagging: 0.08 (3/36)  unmatched excluded: 5/63
chunks: n=24  high precision (seed masked): 1.00  ...
alternatives: n=39  high precision (seed masked): 1.00  ...
```

p1 baseline after bug 003, and the threshold sweep (dev):

```
p1 dev  fast: items: 60  chunk recall: 0.92  calque rate: 0.00
              region precision: 0.86 (143 tags)  over-tagging: 0.09 (7/75)
p1 test full: items: 60  chunk recall: 0.83  calque rate: 0.00
              region precision: 0.89 (129 tags)  over-tagging: 0.05 (4/76)  unmatched excluded: 95/206
              chunks: n=88  high precision (seed masked): 0.83  coverage: 0.72
                calibration: high 63@0.83  med 24@0.38  low 1@0.00
              alternatives: n=118  high precision (seed masked): 0.65  coverage: 0.41

tune.py p1-dev-full (chunks / alts, high n  prec  coverage):
   0.8   0.6  |    60  0.83   0.70   |       69  0.68   0.56
   0.9   0.6  |    55  0.84   0.64   |       53  0.75   0.43
   1.0   0.6  |    55  0.84   0.64   |       53  0.75   0.43
```

p2 on dev (fast) and its single test run:

```
p2 dev iteration 1 (before bug 003): chunk recall: 0.87  region precision: 0.90  over-tagging: 0.05 (4/78)
p2 dev iteration 2:                  chunk recall: 0.98  region precision: 0.88  over-tagging: 0.10 (9/87)   (re-scored with final key)
p2 dev iteration 3 (frozen):         chunk recall: 0.94  calque rate: 0.02  region precision: 0.91  over-tagging: 0.07 (6/81)

=== run.py --prompt p2 --split test --confidence full --verifier gpt-5.4-mini
items: 60  chunk recall: 0.87  calque rate: 0.02
region precision: 0.89 (121 tags)  over-tagging: 0.07 (6/80)  unmatched excluded: 66/176
chunks: n=82  high precision (seed masked): 0.80  coverage: 0.79  base rate: 0.74  verifier agree: 0.88
alternatives: n=94  high precision (seed masked): 0.70  coverage: 0.39  base rate: 0.52  verifier agree: 0.76
```

Adoption: p2 gains recall (+6 items, −4 items) and loses on calque rate (bill-01: _factura_ as an alternative), over-tagging (+2) and chunk high precision. Not adopted; `DEFAULT_VERSION` stays `p1`.

Reproducibility: re-running `run.py --prompt p1 --split test --confidence full` served 60/60 items from the cache with identical metrics (recall 0.83, region precision 0.89, over-tagging 0.05, chunk high precision 0.83).

Seed shape (from `check_mix`):

```
advanced {'items': 30, 'native': 0, 'reference': 4, 'author': 30, 'unchecked': 0}
calque   {'items': 18, 'native': 0, 'reference': 5, 'author': 18, 'unchecked': 0}
regional {'items': 36, 'native': 0, 'reference': 13, 'author': 36, 'unchecked': 0}
simple   {'items': 36, 'native': 0, 'reference': 6, 'author': 36, 'unchecked': 0}
```
