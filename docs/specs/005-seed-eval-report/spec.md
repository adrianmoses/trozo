# Spec: Seed to 120 + Eval Report

| Field   | Value      |
| ------- | ---------- |
| id      | 005        |
| status  | approved   |
| created | 2026-09-26 |

---

## Why <!-- required -->

The eval harness exists: `run.py` scores recall and calques, full mode scores confidence, `tune.py` sweeps thresholds, and every run writes a report with deltas. But the numbers it produces can't be trusted yet, because it measures against a small, partly wrong answer key:

- **Too few items.** There are 30 items, 15 of them in test, so one item moves a metric by about 7 points. The confidence thresholds were tuned on 20 chunks. High-label precision was 1.00 on dev and 0.62 on test, and nobody can say whether that gap is real (003).
- **One right answer per chunk.** Valid Spanish is scored as wrong. All six "wrong" `high` test chunks in 003 were valid (_autobús_, _pasarlo genial_, _está bien_, …), so the key confidence metric is understated by the measure, not by the model.
- **Region tags are never scored.** trozo's differentiator is regional variants, yet no metric asks whether a tag is right, or whether a form used everywhere was given a country tag. ARCHITECTURE has deferred over-tagging to 005 since the start.
- **The answer key itself is unchecked.** Regional answers come from the author's notes and dictionaries, and nothing records how each one was verified.
- **The loop has never run.** OVERVIEW says evals run on every prompt change and decision records cite their metrics. There has only ever been `p1`, so the harness has never guided a change.

005 makes the numbers trustworthy and shows them working once. It adds a larger seed that records how each answer was checked, scoring that accepts valid alternatives and scores regions, and one prompt change chosen and judged by the evals.

### Consumer Impact <!-- required -->

- **Portfolio reviewers** (OVERVIEW's secondary audience, "specifically for the eval harness and its reported metrics") get a README metrics table on a roughly 120-item test-and-dev set. Region accuracy and over-tagging sit next to recall, calque rate and confidence precision. There is an honest p1-vs-p2 comparison, and each regional item shows how its answer was checked.
- **The author, as single user:** confidence thresholds are re-tuned on a set four times larger. If p2 wins, the service's default prompt improves the chunks the author sees and saves.
- **Integration points:**
  - The chunk service is untouched, apart from a new prompt file and, only if p2 wins, its default prompt version (`DEFAULT_VERSION` in `services/chunker/app/prompts.py`).
  - The eval runner still calls `POST /v1/chunk` over HTTP, so evals keep testing exactly what users get.
  - Saved chunks (004) keep their `prompt_version`, so results from before and after a p2 switch stay traceable.

### Roadmap Fit <!-- required -->

- **Last v1 roadmap item.** It needs the harness from 001 and 003, full confidence (003) and the thresholds it re-tunes. Its open decisions come from ARCHITECTURE and the 001 and 003 decision records: accepted variants, over-tagging, and re-tuning on a larger seed.
- **Independent of 002 and 004.** The web app doesn't change.
- **Nothing depends on 005**, but every later prompt or model change will rely on its seed and metrics as the quality bar.

---

## What <!-- required -->

### Acceptance Criteria <!-- required -->

Seed, written as the portfolio reviewer:

- [ ] The seed has about 120 items using the design doc's tier shares: about 36 simple, 36 regional, 30 advanced and 18 calque traps. They are split roughly evenly between `dev` and `test`, and the existing 30 items keep their split.
- [ ] Every item records how its answers were checked, in a `checked` field: `native:<region>` (for example `native:AR`), `reference:<source>` (for example `reference:DLE`), or `author`. An item can list more than one.
- [ ] The report and README show the mix of check methods for each tier, and do not claim items are native-checked when they aren't. Items without a native check are still scored.
- [ ] The seed includes forms used everywhere with `regions: [neutral]` (for example _me emociona mucho_ and _estoy emocionado/a por_, from the design doc) so over-tagging can be measured.
- [ ] Any expected chunk can list `accepted:` alternatives (for example _camión_ with _autobús_). An output matching an accepted alternative counts as found for recall and as correct for confidence precision.
- [ ] Regions stay `neutral`, ES, MX, AR and CO.

Metrics, written as the portfolio reviewer:

- [ ] Every run reports **region precision**: correct region tags divided by all region tags on matched chunks and alternatives.
- [ ] Every run reports the **over-tagging rate**: the share of matched forms expected to be `neutral` that carry a country tag. It appears next to region precision.
- [ ] Existing metrics are kept, and their deltas against the previous comparable run stay in the Markdown report: recall, calque rate, and in full mode high-label precision (seed masked), calibration, consistency and verifier agreement.
- [ ] The 30-item baseline is re-scored with the new scoring (accepted alternatives, region metrics). The report states how much of the 003 test precision gap came from single-answer scoring.

Thresholds and p2, written as the author:

- [ ] T_high and T_med are re-tuned with `tune.py` on the new dev split, and the chosen pair is justified in the decision record. If the 003 values (1.0 and 0.6) still hold, the record says so with the sweep as evidence.
- [ ] p1 is scored on the full new seed (dev and test, fast and full mode) before p2 is written. p2 targets the weakest metric in that baseline, and the decision record names the metric and why.
- [ ] p2 is iterated on dev only. Its final comparison against p1 is a single run on test, reported in full even if p2 does not win.
- [ ] p2 becomes the service's default prompt only if it beats p1 on its target metric on test without making another headline metric worse. Otherwise p1 stays the default and p2 is kept as a documented experiment.

Report, written as the portfolio reviewer:

- [ ] The README has a metrics section with a table of p1 and p2 on test. It shows items, recall, calque rate, region precision, over-tagging rate, and high-label precision and coverage (seed masked), plus the check-method mix, the seed size and the run date.
- [ ] The README has a short before/after write-up: what p2 changed, why, and what moved, linking the full reports in `evals/results/`.
- [ ] The results are reproducible: the README lists the exact `run.py` and `tune.py` commands, and re-running them hits the disk cache with no new LLM calls.

Engineering:

- [ ] The eval code and chunker pytest suites pass, and the web suite is unaffected.
- [ ] The seed file loads in both the eval runner and the chunk service's seed index. New fields (`checked`, `accepted`) don't break `build_index`.

### Non-Goals <!-- required -->

- **No new regions** (VE, CL and others). The design doc's _cotufas_ example stays out.
- **No app changes.** The web app is untouched. The chunk service changes only by a new prompt file and, if p2 wins, its default prompt version.
- **No new metrics beyond region precision and over-tagging.** That means no note recall, no schema pass rate before repair, and no latency or cost figures in the report.
- **No evals in CI.** No GitHub Action and no secrets.
- **No LLM-as-judge** for example naturalness, and **no model-swap eval** (verifier generates, primary verifies). The current model pair stays.
- **No exact parity between the eval matcher and the service matcher** (001), except where accepted alternatives need a matcher change.
- **Native checks don't block 005.** Coverage is reported, not required.

### Open Questions <!-- optional -->

- **Seed index and `accepted:` alternatives. Resolved:** no. `accepted:` affects eval scoring only. The chunk service's seed index (fast-mode "verified") keeps indexing the primary surface, so `high` labels in the product don't widen and the app-changes non-goal holds.
- **Region precision on alternatives with no expectation.** Deferred to the validation step. When the model returns an alternative the seed doesn't list, its region tags can't be scored. Proposed default: exclude them from region precision and report how many were excluded.

---

## How <!-- required -->

### Approach <!-- required -->

1. **Validate the region metric first** (see Confidence). Add region precision and over-tagging to `evals/run.py`, add `accepted:` handling, and re-score the existing p1 runs on the current 30 items.
2. **Seed format** (`evals/seed/seed_v0.yaml`, which becomes `seed_v1.yaml`; `CHUNKER_SEED_PATH` and Compose are updated to match). Optional new fields:
   - `checked: [native:AR, reference:DLE]` on each item;
   - `accepted: [autobús]` on each expected chunk.

   The existing `regions` field is the expectation for region scoring. A chunk the seed tags only `[neutral]` is an over-tagging target.

3. **Scoring** (`evals/run.py`, `evals/confidence_metrics.py`):
   - A match is the primary surface or any `accepted:` alternative, using the existing token-subsequence matcher.
   - **Region precision** is computed over region tags on matched chunks and alternatives: a tag is correct if it appears in the matched expectation's `regions`. Unmatched alternatives are excluded and counted.
   - **Over-tagging** is the share of matches against `[neutral]`-only expectations that carry any country tag.
   - Both metrics go into the summary JSON and the Markdown report, with deltas.
   - The check-method mix per tier also goes into the report.
4. **Grow the seed to about 120 items.**
   - Author the new items by tier.
   - Regional and calque items need a `source` and a `checked` entry.
   - Add neutral-only forms used everywhere to the regional tier.
   - Assign splits for a roughly even dev/test ratio within each tier. Few-shot items in `p1.md` stay in dev.
   - Collect native checks where available and record them in `checked`.
5. **Baseline.** Run p1 on dev and test, in fast and full mode, with `gpt-5.4-mini` as verifier. Re-tune thresholds with `tune.py` on dev. If they change, update ARCHITECTURE and the service's threshold constants; that counts as a confidence-rule constant, not an app feature.
6. **p2.** Read the baseline, pick the weakest headline metric, write `services/chunker/prompts/p2.md`, and iterate on dev by running the service with `CHUNKER_PROMPT_VERSION=p2`. Freeze p2, then run it once on test in both modes. If it meets the adoption rule, change `DEFAULT_VERSION` to `p2`.
7. **Report.** Update the README metrics section and before/after write-up, commit the run artifacts in `evals/results/`, and record the chosen thresholds and p2 target in the decision record.

### Confidence <!-- required -->

**Level:** Medium

**Rationale:**

- **Well understood:** the harness, caching, reports and threshold sweep all exist and work, and the seed format extends cleanly.
- **Most of the effort:** writing and checking about 90 new items, especially regional ones, and native checks depend on outside people.
- **Region metric could be useless.** It could turn out uninformative, for example always near 1.0, or dominated by unmatched alternatives.
- **p2 may not beat p1.** The spec accepts that outcome.
- **Unknown dev/test gap.** Threshold re-tuning may still show a gap between dev and test at this size.

**Validate before proceeding:**

- Implement region precision, over-tagging and `accepted:` scoring, then re-score the existing 30-item p1 runs. Proceed with the 90 new items only if:
  - region precision is not trivially 1.0;
  - the number of unmatched alternatives excluded is reported and is not the majority;
  - `accepted:` changes 003's test high-label precision in the expected direction.

### Key Decisions <!-- optional -->

- **Record how each answer was checked, and report it.** Items are never blocked on a native check. The seed grows at authoring speed, and honesty sits in the report instead of in a gate.
- **p2's target comes from the baseline, not chosen up front.** This demonstrates the loop OVERVIEW describes (measure, change, re-measure) rather than a pre-chosen improvement.
- **Adopt p2 only on a win on test with no regressions.** The comparison stays honest, and the product never gets a worse default because of the demo.
- **`accepted:` is eval-only.** The chunk service's seed index ignores it, so product labels don't change as a side effect of fairer scoring.
- **Keep the existing splits** for the original 30 items, so earlier runs remain comparable on the items they share.

### Testing Approach <!-- required -->

OVERVIEW's product quality bar is the eval suite itself. The code that computes it still needs unit tests.

- **Scoring unit tests** (pytest, in `evals/` and sharing the chunker environment):
  - an `accepted:` alternative counts for recall and confidence precision;
  - region precision on hand-built responses, with correct, extra and missing tags;
  - unmatched alternatives are excluded and counted;
  - over-tagging, with a neutral-only expectation that gets a country tag and one that doesn't;
  - the check-method mix is counted per tier.
- **Seed validation test:**
  - every item has `id`, `tier`, `split`, `input`, `expected_chunks`, `source` and `checked`;
  - regions are in the allowed set;
  - ids are unique;
  - tier counts and the dev/test ratio are within tolerance of the targets;
  - few-shot items from `p1.md` are in dev.
- **Service compatibility:** the existing seed tests in `services/chunker/tests/test_seed_confidence.py` pass against the new seed file. `build_index` ignores `checked` and `accepted`, and a test asserts that an `accepted:` alternative is **not** a seed match.
- **Reproducibility check:** re-running the README's commands serves every item from the cache, with no LLM calls.
- **Existing suites:** chunker pytest and web Vitest stay green.
