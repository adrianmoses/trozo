# Decision Record: Full Confidence

| Field   | Value                |
| ------- | -------------------- |
| id      | 003                  |
| status  | implemented          |
| created | 2026-09-25           |
| spec    | [spec.md](./spec.md) |

---

## Context <!-- required -->

Fast mode could only label seed-matched chunks, so almost every real phrase showed a wall of `unrated`. 003 was specced at **Low** confidence with three gates, because three assumptions could each hollow the feature out: that Claude Sonnet 5's default sampling varies enough to measure consistency (the model rejects temperature, per 001), that a verifier would catch wrong claims rather than rubber-stamp them, and that about 20 dev chunks could tune two thresholds. During discovery the human chose an OpenAI verifier, the full design-doc web UX, measure-first variance, and in-scope poison and report work; per-region-tag confidence and cost caps were excluded.

Four things discovered during implementation shaped the result:

- **Sampling barely varies.** 90% of dev chunks agreed unanimously across five default samples. Few-shot reordering, the planned remedy, moved that only to 85%. Variance lives in the regional alternatives instead (about half below 1.0).
- **The verifier is strong.** Both candidate OpenAI models caught 13/13 poison claims and accepted 6/6 true controls, so the choice came down to cost and behaviour on unexpected chunks.
- **Held-out precision is much lower than dev**, and every "wrong" `high` chunk on test turned out to be valid Spanish the seed does not list. The measure, not the labels, is the binding constraint.
- **The seed index has been empty in every local run since 001.** While writing this record, _echar de menos_ at ES came back `seed: false` although the seed lists it for ES. `DEFAULT_SEED_PATH` in `app/pipeline/seed.py` resolves `parents[3]` to `services/`, so it points at `services/evals/seed/seed_v0.yaml`, which does not exist. Only docker compose sets `CHUNKER_SEED_PATH`. Every local eval and smoke run for 001–003 therefore had no seed signal; seed precedence is covered by unit tests with an explicit path, never live. It was not fixed here (see Spec Gaps Exposed).

Work was done on `feature/003-full-confidence`; not yet merged.

## Decision <!-- required -->

`confidence_mode: full` rescores the fast response instead of regenerating it, so chunk ids, text and order never change under the user. It runs five Claude samples and one batched verifier call concurrently. Consistency is the share of samples containing a chunk or alternative by lemma-key overlap (the seed index's matcher). The verifier, OpenAI `gpt-5.4-mini`, answers yes/no/unsure per claim about meaning and region. Labels follow ARCHITECTURE's rule order with thresholds tuned on dev to **T_high = 1.0** (all five samples agree, plus verifier agreement) and **T_med = 0.6**. Full results are cached under their own key and relabelled from stored signals on every read. Verifier or sampling failure degrades rather than errors. The web fetches full mode in the background, patches the fast query's cache entry so back/forward stay instant, spins unrated labels while pending, and greys `low` chunks with a "check this" tooltip. The eval harness gains a full mode with seed-masked high-label precision, calibration, consistency histograms and verifier agreement, plus a threshold sweep, a poison-claim check and Markdown reports with run-over-run deltas. Default sampling was kept because perturbation added no variance.

---

## Alternatives Considered <!-- required -->

### Verifier vendor and model

**Option A: Anthropic model (Haiku or Opus).**

- Pros: no new key or SDK.
- Cons: errors correlated with the Claude primary, against ARCHITECTURE's intent.

**Option B: OpenAI, `gpt-5.5`.**

- Pros: strongest candidate; 13/13 poison, 6/6 controls.
- Cons: agreed with 4 of 6 unexpected dev chunks; about twice as slow (20.5 s vs 8.9 s for 15 items).

**Option C: OpenAI, `gpt-5.4-mini`.**

- Pros: same 13/13 and 6/6; agreed with only 2 of 6 unexpected chunks; faster and cheaper.
- Cons: a smaller model may miss subtler region errors than the poison set contains.

**Chosen:** C. Vendor was the human's choice; the model followed the spike's rule (tie on poison, pick the cheaper). Configurable via `CHUNKER_VERIFIER_MODEL`.

### Variance source for self-consistency

**Option A: Default sampling.**

- Pros: measures the model's own uncertainty; no prompt manipulation.
- Cons: chunk consistency saturates (90% at 1.0).

**Option B: Few-shot reordering per sample.**

- Pros: guaranteed prompt variation.
- Cons: measured no gain (chunks 85% at 1.0; alternatives moved the other way, 53% to 60%); variation it adds reflects prompt sensitivity rather than uncertainty.

**Chosen:** A, with B kept behind `CHUNKER_SAMPLE_PERTURB`. The spec's decision rule said "perturb if >80% at 1.0, then re-measure"; the re-measurement showed perturbation does not fix saturation, so it was not worth its cost in meaning.

### How full mode obtains chunks

**Option A: Generate a new draft and signals together.**

- Cons: chunk ids and text could differ from the fast result, so the web cannot patch in place.

**Option B: Rescore the cached fast response.**

- Pros: identical ids and text by construction; the verifier needs only the fast response, so it runs concurrently with the samples; latency is about one Sonnet call plus the verifier.
- Cons: full mode depends on the fast entry existing (a cold full request generates it first).

**Chosen:** B.

### Thresholds

**Option A: Keep ARCHITECTURE's 0.8 / 0.6.**

- Pros: no tuning on a thin sample.
- Cons: dev high precision 0.93 on chunks, 0.42 on alternatives.

**Option B: T_high 1.0, T_med 0.6.**

- Pros: dev high precision 1.00 on chunks and 0.54 on alternatives; "unanimous samples plus verifier agreement" is explainable. With N=5 consistency moves in 0.2 steps, so 0.9 and 1.0 are the same rule.
- Cons: fewer `high` labels (chunks 70% to 65% coverage, alternatives 63% to 43%); the chunk precision gain on dev is one chunk.

**Option C: Also raise T_med to 0.8.**

- Cons: changed a single alternative; no evidence either way.

**Chosen:** B. The alternative-level gain (6 items) carried more weight than the one-chunk dev gain.

### Cached full results after re-tuning

**Option A: Put thresholds in the cache key.**

- Cons: every re-tune invalidates the whole full cache and re-spends about six calls per phrase.

**Option B: Store signals; recompute labels on read.**

- Pros: signals are the expensive, durable part; re-tuning is free.
- Cons: the cached label field is advisory until read through the service.

**Chosen:** B. Found necessary when the tuned threshold did not reach already-cached dev results.

### Where the "check this" tooltip lives

Only one approach was seriously considered once `low` chunks needed the same tooltip as `low` variants: move it into `ConfidenceLabel`, so both share one implementation (previously it lived in `VariantsList`).

---

## Tradeoffs <!-- required -->

- **The verifier carries most chunk-level signal.** Consistency is weak on chunks with Sonnet 5; `high` effectively means "verifier agrees and nothing varied". Alternatives get real value from consistency.
- **About six LLM calls per new phrase in full mode** (five Sonnet, one OpenAI), about 6 s per item on a cold cache, no cost cap by design. Caching makes repeats free.
- **Precision is measured pessimistically.** Correct means "matches an expected chunk", so reported precision understates the truth, and thresholds tuned against it lean conservative.
- **Thresholds were tuned on 20 chunks and 30 alternatives.** Dev precision (1.00) did not carry to test (0.62 vs base 0.54); expect re-tuning in 005.
- **Label rules exist twice** (`app/pipeline/full.py` and `evals/confidence_metrics.py`) so evals keep their own environment; kept to one small function each with cross-referencing comments.
- **Degradation over failure.** A missing verifier or failed samples produce weaker labels, never an error, so a quietly broken verifier would show up only as more `med` labels.
- **The web makes a second request per new phrase** and briefly shows spinners; skipped entirely when every label is already seed-verified.

---

### Spec Divergence <!-- optional -->

All 14 acceptance criteria are met, with the caveats in the table. Divergences from the spec:

| Spec Said                                                                                         | What Was Built                                                                                                                    | Reason                                                                                                                                      |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Criterion 3: if full confidence fails ("verifier or sampling unavailable"), labels stay `unrated` | A whole-request failure leaves labels `unrated`; a verifier-only or sampling-only failure yields labels from the remaining signal | Criterion 8 requires consistency-only labels without an OpenAI key; the two criteria conflict, and degrading per signal keeps what is known |
| Rules: "else `low`"                                                                               | No signal at all (under 3 samples and no verifier) yields `unrated`, not `low`                                                    | Labelling something `low` on zero evidence would be a false warning                                                                         |
| Variance: perturb when more than 80% agree at 1.0                                                 | Perturbation measured, found ineffective, left off                                                                                | Re-measurement (the spec's own next step) showed 85%; no benefit to justify it                                                              |
| Thresholds "starting at 0.8 / 0.6"                                                                | 1.0 / 0.6                                                                                                                         | Tuning sweep; see Alternatives                                                                                                              |
| Full cache key "adds `full`, N and the verifier model"                                            | Also adds the perturbation flag; labels recomputed from stored signals on read                                                    | A perturbed run must not serve unperturbed signals; re-tuning should not need eviction                                                      |
| Poison set of 10–15 wrong claims                                                                  | 13 wrong claims plus 6 true controls                                                                                              | Controls measure rubber-stamping from the other side                                                                                        |
| Markdown report beside each JSONL                                                                 | Also a `.summary.json` per run                                                                                                    | Deltas need machine-readable previous metrics                                                                                               |
| `/v1/meta` unchanged                                                                              | Adds `verifier_model` and `full_confidence` (samples, thresholds)                                                                 | The runner reads live thresholds and checks the verifier model                                                                              |
| Criterion 1: seed-verified labels never change                                                    | Holds in code and unit tests; never observed live                                                                                 | The seed index is empty outside Docker (path bug, see Context)                                                                              |

---

## Spec Gaps Exposed <!-- optional -->

- **Seed path bug (since 001), needs `ss-fix`.** `DEFAULT_SEED_PATH` should be `parents[4]`. Fixing the path is not enough: fast and full cache entries store `signals.seed = false`, so they also need the seed signal recomputed on read (or a cache clear). All local "verified" behaviour since 001 is untested live, and the 001/002 decision records' fast-confidence claims rest on unit tests only.
- **The seed's single-answer format caps the metrics.** All six "wrong" `high` test chunks are valid (_autobús_, _pasarlo genial_, _me gusta_, _por mí_, _está bien_, _trabajo_). 005 should add accepted-variant lists per expected chunk, or high-label precision stays understated.
- **Chunk-level self-consistency is weak with Sonnet 5.** Worth revisiting if a future primary supports sampling parameters, or with more samples; the ARCHITECTURE rule set assumed temperature 0.8 sampling.
- **ARCHITECTURE.md is out of date** on four points: generation "temp 0.3" and sampling "temp 0.8" (neither is possible), model choice listed as open (now Claude Sonnet 5 plus `gpt-5.4-mini`), and the response cache described as Postgres (disk since 001). Candidate spec revision.
- **Per-region-tag confidence remains unmeasured** (non-goal here); over-tagging is still only a 005 aspiration.

---

## Test Evidence <!-- required -->

Suites on the feature branch (2026-09-25):

```
pytest services/chunker: 68 passed in 1.76s
packages/schema test$ tsc --noEmit            (clean)
apps/web test:  Test Files  15 passed (15)
apps/web test:       Tests  69 passed (69)
eslint: clean
prettier: All matched files use Prettier code style!
pnpm build: [nitro] ✔ You can preview this build using npx vite preview
```

Gate 1, variance (dev, 15 items, 5 samples each):

```
== spike (perturb=False), 15 dev items ==
chunks: 20; samples per item: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5]
consistency distribution: {0.6: 1, 0.8: 1, 1.0: 18}
share at 1.0: 18/20 = 90%  (rule: >80% -> perturb)
alternatives: 30; consistency dist: {0.0: 1, 0.4: 5, 0.6: 6, 0.8: 2, 1.0: 16}

== spike (perturb=True), 15 dev items ==
consistency distribution: {0.4: 1, 0.8: 2, 1.0: 17}
share at 1.0: 17/20 = 85%  (rule: >80% -> perturb)
alternatives: 30; consistency dist: {0.0: 1, 0.2: 2, 0.4: 2, 0.6: 4, 0.8: 3, 1.0: 18}
```

Gate 2, verifier:

```
-- verifier on dev chunks (agree rate / agree-when-correct / agree-when-incorrect) --
gpt-5.5        agree 18/20  |correct 14/14  |incorrect 4/6
gpt-5.4-mini   agree 16/20  |correct 14/14  |incorrect 2/6
-- poison set --
gpt-5.5        catch 13/13 = 100%  controls accepted 6/6  missed=[]
gpt-5.4-mini   catch 13/13 = 100%  controls accepted 6/6  missed=[]

$ uv run scripts/poison.py
verifier: gpt-5.4-mini
poison caught:     13/13 = 100%
controls accepted: 6/6 = 100%
```

Gate 3, tuning (`tune.py` over the dev full-mode run, seed masked; selected rows):

```
chunks: n=20 base rate=0.70
 T_high T_med | high n  prec  coverage | low n  acc
   0.8   0.6  |    14  0.93   0.70   |     1  0.00
   1.0   0.6  |    13  1.00   0.65   |     1  0.00
alts: n=30 base rate=0.27
   0.8   0.6  |    19  0.42   0.63   |     1  0.00
   1.0   0.6  |    13  0.54   0.43   |     1  0.00
```

Full-mode eval runs with the tuned thresholds (verifier `gpt-5.4-mini`), plus fast-mode regression:

```
== full dev ==
items: 15  chunk recall: 0.98  calque rate: 0.00
chunks: n=20  high precision (seed masked): 1.00  coverage: 0.65  base rate: 0.70  verifier agree: 0.70
  calibration: high 13@1.00  med 6@0.17  low 1@0.00
alternatives: n=30  high precision (seed masked): 0.54  coverage: 0.43  base rate: 0.27  verifier agree: 0.80
  calibration: high 13@0.54  med 16@0.06  low 1@0.00
== full test ==
items: 15  chunk recall: 1.00  calque rate: 0.00
chunks: n=24  high precision (seed masked): 0.62  coverage: 0.67  base rate: 0.54  verifier agree: 0.75
  calibration: high 16@0.62  med 8@0.38
alternatives: n=39  high precision (seed masked): 0.67  coverage: 0.23  base rate: 0.28  verifier agree: 0.72
  calibration: high 9@0.67  med 25@0.16  low 5@0.20
== fast dev / test ==
items: 15  chunk recall: 0.98  calque rate: 0.00
items: 15  chunk recall: 1.00  calque rate: 0.00
```

Test-split `high` chunks scored incorrect, all valid Spanish outside the seed:

```
bus-01        'autobús'         expected=['llegar tarde', 'colectivo', 'camión']
apply-job-01  'trabajo'         expected=['solicitar un empleo']
job-01        'me gusta'        expected=['trabajo', 'chamba', 'curro']
concerned-01  'por mí'          expected=['en lo que a mí respecta']
concerned-01  'está bien'       expected=['en lo que a mí respecta']
good-time-01  'pasarlo genial'  expected=['pasarlo bien']
```

Generated report excerpt (`20260925T155954Z-p1-dev-full.md`, compared against the pre-tuning run):

```
| chunks: high precision (seed masked) | 1.00 | +0.07 |
| chunks: high coverage (seed masked) | 0.65 | -0.05 |
| alternatives: high precision (seed masked) | 0.54 | +0.12 |
| alternatives: high coverage (seed masked) | 0.43 | -0.20 |
```

Live smoke (`pnpm dev:all`, Chrome):

```
mockup phrase, neutral:   t=0 ms  [unrated*, unrated*, unrated*]  ->  t=7897 ms  [high, med, high]
"Let's get some popcorn": 2 server-function POSTs (chunkFn, chunkFullFn); settled [med, high];
                          variants: "AR pochoclo coloquial high", "CO crispetas high"
history.back()/forward(): settled labels, 0 spinners, 0 server-function requests
no OPENAI_API_KEY (port 8001): verifier_model = None;
  echar de menos {'label': 'med', 'signals': {'seed': False, 'consistency': 1.0, 'verifier': None}}  (HTTP 200)
console errors: none
```

Seed path check that exposed the 001 bug:

```
DEFAULT_SEED_PATH = /Users/adrianmoses/Developer/trozo/services/evals/seed/seed_v0.yaml exists: False
index size = 0
```
