# 003 evidence log (working notes for the decision record)

Raw files (gitignored) are in `evals/results/`; the numbers below are copied from their console output.

## Gate 1: variance (dev split, 15 items, 5 samples each, claude-sonnet-5)

Default sampling (`20260925T155241Z-spike003.json`):

```
chunks: 20; samples per item: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5]
consistency distribution: {0.6: 1, 0.8: 1, 1.0: 18}
share at 1.0: 18/20 = 90%  (rule: >80% -> perturb)
alternatives: 30; consistency dist: {0.0: 1, 0.4: 5, 0.6: 6, 0.8: 2, 1.0: 16}
chunks below 1.0: cool-01 'qué genial' 0.6 (unexpected), juice-01 'quisiera' 0.8 (unexpected)
```

Few-shot reordering per sample (`20260925T155409Z-spike003-perturb.json`):

```
consistency distribution: {0.4: 1, 0.8: 2, 1.0: 17}
share at 1.0: 17/20 = 85%
alternatives: 30; consistency dist: {0.0: 1, 0.2: 2, 0.4: 2, 0.6: 4, 0.8: 3, 1.0: 18}
chunks below 1.0: cool-01 'qué genial' 0.4 (unexpected), hangout-01 'quedar' 0.8 (correct), realize-01 'ser tarde' 0.8 (unexpected)
```

Decision: perturbation did not add variance (chunks 90% -> 85% at 1.0, alternatives 53% -> 60%), so default sampling is kept; `CHUNKER_SAMPLE_PERTURB` stays available, off. Chunk consistency saturates but its sub-1.0 cases are mostly unexpected chunks; alternative consistency varies widely.

## Gate 2: verifier (poison set 13 false + 6 true controls; dev claims)

```
-- verifier on dev chunks (agree rate / agree-when-correct / agree-when-incorrect) --
gpt-5.5        agree 18/20  |correct 14/14  |incorrect 4/6
gpt-5.4-mini   agree 16/20  |correct 14/14  |incorrect 2/6
-- poison set --
gpt-5.5        catch 13/13 = 100%  controls accepted 6/6  missed=[]
gpt-5.4-mini   catch 13/13 = 100%  controls accepted 6/6  missed=[]
gpt-5.5: verifier pass 20.5s ; gpt-5.4-mini: verifier pass 8.9s   (15 items, 8 concurrent)
```

Decision: tie on poison -> cheaper model, `gpt-5.4-mini` (also agrees less with unexpected chunks, ~2x faster). Standalone re-run via `scripts/poison.py`: caught 13/13, controls 6/6.

## Gate 3: tuning (dev, full mode, seed masked; `tune.py` over `20260925T155721Z-p1-dev-full.jsonl`)

```
chunks: n=20 base rate=0.70
 T_high T_med | high n  prec  coverage | low n  acc
   0.8   0.6  |    14  0.93   0.70   |     1  0.00
   1.0   0.6  |    13  1.00   0.65   |     1  0.00
alts: n=30 base rate=0.27
   0.8   0.6  |    19  0.42   0.63   |     1  0.00
   1.0   0.6  |    13  0.54   0.43   |     1  0.00
```

Decision: T_high = 1.0 (unanimous samples; 0.9 is equivalent at N=5), T_med = 0.6 unchanged (moving it changed one alternative).

## Full-mode eval runs with tuned thresholds (T_high 1.0, T_med 0.6, verifier gpt-5.4-mini)

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
== fast (regression) ==
dev  items: 15  chunk recall: 0.98  calque rate: 0.00
test items: 15  chunk recall: 1.00  calque rate: 0.00
```

The six test chunks labelled `high` but scored incorrect are all valid Spanish the seed does not list (pessimistic correctness):

```
bus-01        'autobús'         expected=['llegar tarde', 'colectivo', 'camión']
apply-job-01  'trabajo'         expected=['solicitar un empleo']
job-01        'me gusta'        expected=['trabajo', 'chamba', 'curro']
concerned-01  'por mí'          expected=['en lo que a mí respecta']
concerned-01  'está bien'       expected=['en lo que a mí respecta']
good-time-01  'pasarlo genial'  expected=['pasarlo bien']
```

Full dev run wall time: 1:35 for 15 items on a cold full cache (~6.3 s per item).

## Suites (2026-09-25)

```
pytest services/chunker: 68 passed
vitest apps/web: Test Files 15 passed (15), Tests 69 passed (69)
packages/schema: tsc --noEmit clean
eslint clean; prettier: All matched files use Prettier code style!
pnpm build: nitro build OK
```

## Live smoke (`pnpm dev:all`, Chrome)

- Mockup phrase, neutral: labels `unrated*, unrated*, unrated*` (spinning) at t=0, settled to `high, med, high` at t=7.9 s. No console errors.
- New phrase "Let's get some popcorn": exactly 2 server-function POSTs (chunkFn, chunkFullFn); settled `med, high`; variants `AR pochoclo coloquial high`, `CO crispetas high`.
- history.back()/forward(): settled labels, 0 spinners, 0 server-function requests.
- Chunk service without OPENAI_API_KEY (port 8001): `verifier_model = None`; full mode returned `echar de menos {'label': 'med', 'signals': {'seed': False, 'consistency': 1.0, 'verifier': None}}`, HTTP 200.
