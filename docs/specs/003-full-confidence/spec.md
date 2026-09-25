# Spec: Full Confidence

| Field   | Value      |
| ------- | ---------- |
| id      | 003        |
| status  | draft      |
| created | 2026-09-25 |

---

## Why <!-- required -->

Fast mode can only say "verified" when a chunk is in the 30-item seed; everything else is `unrated`. On real phrases that is almost everything: the design-doc demo sentence returns three chunks, all unrated. trozo's promise is not just chunks but chunks whose confidence label means something, derived from signals rather than the model grading itself. Full confidence supplies those signals for every chunk and variant, and turns the eval harness's key question, "does `high` actually mean correct?", from a design-doc aspiration into a measured number.

### Consumer Impact <!-- required -->

- **The author, as single user** (OVERVIEW): every chunk and regional variant gets a `high`, `med` or `low` label within a few seconds of the fast result, so "check this" warnings appear on the doubtful ones instead of a wall of neutral "unrated".
- **Portfolio reviewers**: the eval report gains high-label precision, calibration by confidence bucket, verifier catch rate on deliberately wrong claims, and run-over-run deltas, the metrics OVERVIEW names as the eval harness's point.
- **Integration points**: the chunk service's `confidence_mode: full` becomes real (in 001–002 it returned a fast answer); the web app gains a second, background server function; the service gains a second LLM vendor (OpenAI) as verifier.

### Roadmap Fit <!-- required -->

Depends on 001 (pipeline, seed index, lemma matcher) and 002 (the query cache this feature patches, and the `ConfidenceLabel` component whose static `unrated` state 003 animates). 004 saves the confidence label with each chunk, so full labels should exist first. 005 grows the seed and native-checks it, which will re-tune the thresholds set here on a larger sample.

---

## What <!-- required -->

### Acceptance Criteria <!-- required -->

Service and web, written as the user:

- [ ] After a result appears, every `unrated` label shows a small spinner and, within roughly the time of the fast call again, settles into `high`, `med` or `low`. Seed-verified labels never change. Chunk text, examples and order do not change when the labels settle.
- [ ] `low` chunks and variants are visibly greyed and carry a "check this" tooltip; confidence always keeps its text label.
- [ ] If full confidence fails (verifier or sampling unavailable), the spinners stop, the labels stay `unrated`, and the rest of the result is untouched. No error banner.
- [ ] Back/forward to an earlier phrase shows its settled labels immediately, with no new service call.
- [ ] `POST /v1/chunk` with `confidence_mode: full` returns the same draft as the fast call for that phrase and region (same chunk ids, surfaces and examples; only `request_id`, `meta` and confidence differ), with `confidence.signals` carrying `seed`, `consistency` (0–1, share of samples) and `verifier` (`agree`, `disagree` or `unsure`) for every chunk and alternative.
- [ ] Labels follow ARCHITECTURE's rules, first match wins: seed match → `high`; consistency ≥ T_high and verifier agrees → `high`; consistency ≥ T_med or verifier agrees → `med`; else `low`. T_high and T_med are the values tuned on dev (starting at 0.8 / 0.6).
- [ ] A repeated full request is served from cache with no LLM calls. The fast path's cost and latency are unchanged.
- [ ] The verifier is an OpenAI model behind the `LLMClient` interface, chosen by `CHUNKER_VERIFIER_MODEL`; the primary stays Claude. Missing `OPENAI_API_KEY` degrades full mode to consistency-only signals rather than failing.

Evals, written as the portfolio reviewer:

- [ ] `run.py --confidence full --verifier <model>` records every signal per chunk and prints, besides recall and calque rate: high-label precision with the seed rule masked, accuracy per confidence bucket (calibration), the consistency distribution, and verifier agreement rate.
- [ ] A threshold sweep over the dev split's recorded signals (no new LLM calls) reports high-label precision and coverage per (T_high, T_med) pair; the chosen pair is committed and justified in the decision record.
- [ ] A poison-claim set of 10–15 deliberately wrong claims (e.g. _pochoclo_ tagged ES) is run through the verifier and its catch rate reported.
- [ ] Each run writes a Markdown report next to its JSONL, with metric deltas against the previous comparable run and a list of newly failing items.
- [ ] Recall and calque rate on dev and test are unchanged from 002 (full mode does not alter the draft).
- [ ] pytest, Vitest, schema, type-check, lint and Prettier all pass.

### Non-Goals <!-- required -->

- **Per-region-tag confidence.** ARCHITECTURE asks for confidence per chunk and per region tag; the contract keeps one label per chunk and per alternative. Region correctness is not scored separately.
- **Cost caps** per request or per eval run. Caching and documentation only.
- Seed growth and native-speaker checks (005); saving and export (004).
- Changes to the primary prompt `p1`. Samples may perturb few-shot order or content per the spike, but the fast draft's prompt and version are untouched.
- LLM-as-judge metrics.
- A user-facing explanation of signals (why a label is `med`) beyond the label itself.

### Open Questions <!-- optional -->

- **Variance source.** Decided by the spike (see Confidence). Deferred to implementation with an explicit decision rule.
- **Correctness for precision is pessimistic.** A chunk counts as correct only when it matches an expected chunk for that seed item, so a valid chunk the seed did not anticipate counts as wrong. Accepted for 003 (it biases thresholds conservative); 005's larger, native-checked seed reduces the effect. Deferred.
- **Dev sample size.** About 20 dev chunks are thin for tuning two thresholds. Accepted; the decision record reports coverage alongside precision, and 005 re-tunes on 120 items. Deferred.
- **Concrete OpenAI verifier model.** Chosen at implementation from what the key can access, configurable by env. Deferred.

---

## How <!-- required -->

### Approach <!-- required -->

**1. Verifier client (`services/chunker/app/llm.py`)**

- `OpenAILLMClient` implementing `LLMClient.generate_structured(system, user, output_model)` with OpenAI structured outputs; errors map to the existing `LLMError` / `LLMRateLimited`. Model from `CHUNKER_VERIFIER_MODEL`. Add the `openai` SDK dependency.
- `get_verifier()` beside `get_llm()`; returns `None` when `OPENAI_API_KEY` is unset. Tests inject a fake like the existing `FakeLLMClient`.

**2. Full pipeline (`services/chunker/app/pipeline/full.py`, pure functions plus one orchestrator)**

- Obtain the draft exactly as the fast path does (cache hit or one generation), so chunk ids and text are identical to the fast response.
- **Sampling:** N=5 further `generate_structured` calls, run concurrently (thread pool), each passed through `validate_repair`. Variance source per the spike. A failed sample is dropped; if fewer than 3 succeed, consistency is left `null`.
- **Consistency:** for each chunk and each alternative, the share of successful samples containing a chunk or alternative whose `lemma_key` overlaps the target's (`keys_overlap`, the matcher the seed index already uses). Unmatched near-misses are logged, per the design doc.
- **Verifier:** one batched call. Claims are built per chunk ("Is _{pattern} {slots}_ commonly used {in regions} to mean '{gloss}'?") and per alternative ("… commonly used in {regions} …"); the structured response is a list of `{claim_id, answer: yes|no|unsure, reason}`. Mapped to `signals.verifier` as `agree`, `disagree` or `unsure`. A verifier failure leaves `verifier` null.
- **Labels:** `full_confidence(signals, t_high, t_med)` applies the ARCHITECTURE rules. Thresholds are module constants set from the tuning sweep.
- **Cache:** the full response is cached under a separate key that adds `full`, N, and the verifier model to the existing hash. The fast cache entry is not modified.
- `POST /v1/chunk` dispatches on `confidence_mode`. No contract change: `Signals` already has `consistency` and `verifier`.

**3. Web (`apps/web`)**

- `chunkFullFn` server function (same validator; `confidence_mode: 'full'`) and a second query keyed `['chunk-full', region, q]`, enabled only when the fast query succeeded with at least one chunk. On success it writes the full response into the fast query's cache entry (`setQueryData`), which makes back/forward instant. On failure the fast data stays and the pending state clears.
- `ConfidenceLabel` gains a pending state: `unrated` plus a small spinner while the full query is in flight. `low` rows in `VariantsList` already grey out with the tooltip; `ChunkCard` gets the same treatment for a `low` chunk.

**4. Evals (`evals/`)**

- `run.py` gains `--confidence fast|full` and `--verifier`; JSONL rows keep every signal.
- Metrics computed from recorded signals: high-label precision with the seed rule masked (labels recomputed from consistency and verifier only), accuracy per bucket, consistency histogram, verifier agreement rate. Correct = the chunk matches an expected chunk (the runner's existing matcher).
- `tune.py` (or `run.py --sweep`) grids T_high × T_med over a dev JSONL and prints precision and coverage per pair.
- `seed/poison_v0.yaml` with 10–15 wrong claims (wrong region tags, wrong meanings); `poison.py` sends them through the verifier client and reports catch rate (`no` answers / total).
- Markdown report written beside each JSONL: headline metrics, deltas against the most recent run with the same split and confidence mode, newly failing items.

**Sequencing**

1. Spike (validation gate below).
2. Verifier client and full pipeline with pytest.
3. Eval runner extensions, poison set, sweep; run on dev; commit tuned thresholds.
4. Web background call, cache patch, spinner.
5. Markdown report; full runs on dev and test; suites green.

### Confidence <!-- required -->

**Level:** Low

**Rationale:** The rules, contract fields and web hook points already exist, and the matcher is proven by 001. Three assumptions are untested and each could hollow out the feature: (1) Claude Sonnet 5 at default sampling may produce near-identical samples, making consistency a constant 1.0; (2) the verifier may agree with almost every claim, making it a rubber stamp; (3) about 20 dev chunks may not separate good thresholds from bad ones.

**Validate before proceeding:**

- **Variance spike:** 5 default-sampling runs per dev item (≈75 calls). Report the distribution of per-chunk consistency. Decision rule: if more than 80% of chunks score 1.0, add prompt perturbation (varied few-shot order or subset per sample) and re-measure before building further.
- **Verifier spike:** run the poison claims and the dev chunks' claims through the chosen OpenAI model. If it catches fewer than half the poison claims, revisit the claim wording or model before wiring it into labels.
- **Tuning feasibility:** from the spike's signals, run the sweep once. If no threshold pair gives both usable coverage and higher precision than "label everything med", record that and fall back to ARCHITECTURE's 0.8 / 0.6 with the caveat, rather than overfitting.
- Record all three outcomes in the decision record.

### Key Decisions <!-- optional -->

- **OpenAI verifier** (human): a different vendor from the Claude primary keeps errors less correlated, as ARCHITECTURE intends.
- **Variance source decided by measurement** (human): no temperature lever exists; the spike picks default sampling or perturbation with a stated rule.
- **Full design-doc web UX in 003** (human): the background call, cache patch and spinners ship with the signals, not later.
- **One label per chunk and alternative** (human): per-region-tag confidence is out; no contract change.
- **No cost caps** (human).
- **Full mode reuses the fast draft** (agent, stated in reflect-back): samples only produce signals, so ids and text never shift under the user and the web can patch in place.
- **Seed rule masked when tuning** (agent, stated in reflect-back): otherwise every seed chunk is `high` by rule 1 and precision is trivially perfect.
- **Graceful degradation** (agent): verifier or sampling failures leave signals null and labels `unrated`; full mode never turns a good fast result into an error.

### Testing Approach <!-- required -->

Per OVERVIEW: pytest with fakes on the service, Vitest + Testing Library on the web, the eval suite as the product bar.

**pytest (`services/chunker`)**

- Consistency: target present in 5/5, 3/5, 0/5 samples; optional-word overlap counts; alternatives scored against sample alternatives and chunks; fewer than 3 successful samples → null.
- Rules: each branch of `full_confidence`, including seed precedence and threshold boundaries (exactly T_high, just below).
- Verifier: claim construction for chunks and alternatives; answer mapping; missing claim ids → null; verifier exception → null signals, response still 200.
- Endpoint: full response has the same ids and text as fast for a queued draft; signals populated; second full call served from cache with zero LLM calls; fast cache entry untouched; no `OPENAI_API_KEY` → consistency-only.
- OpenAI client: error mapping with the SDK mocked.

**Vitest (`apps/web`)**

- `ConfidenceLabel` pending spinner for `unrated` only; settles to the label text.
- Translator view: fast result then full data patched in; labels change, text does not; full failure leaves `unrated` without spinner and without an alert; cached full data renders immediately.
- `ChunkCard` greys a `low` chunk with the tooltip.

**Evals**

- Spike outputs (variance histogram, poison catch rate, first sweep) recorded in the decision record.
- `run.py --confidence full` on dev and test: recall and calque rate unchanged; new metrics printed and written to the Markdown report.
- Manual smoke: the mockup phrase settles from all-unrated to real labels; a stopped verifier key leaves consistency-only labels; back/forward shows settled labels without a request.
