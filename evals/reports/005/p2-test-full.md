# Eval run 20260927T081348Z

prompt `p2` · split `test` · confidence `full` · model `claude-sonnet-5` · verifier `gpt-5.4-mini`

Compared with: no previous comparable run.

| Metric | Value | Δ vs previous |
| --- | --- | --- |
| items | 60 |  |
| chunk recall | 0.87 |  |
| calque rate | 0.02 |  |
| region precision | 0.89 |  |
| over-tagging rate | 0.07 |  |

Region scoring: 110 of 176 chunks and alternatives matched an expected chunk (66 unmatched, excluded); 121 tags scored; 6 of 80 matches on neutral-only expectations carried a country tag.
| chunks: high precision (seed masked) | 0.80 |  |
| chunks: high coverage (seed masked) | 0.79 |  |
| chunks: base rate (matches expected) | 0.74 |  |
| chunks: verifier agree rate | 0.88 |  |
| alternatives: high precision (seed masked) | 0.70 |  |
| alternatives: high coverage (seed masked) | 0.39 |  |
| alternatives: base rate (matches expected) | 0.52 |  |
| alternatives: verifier agree rate | 0.76 |  |

### Calibration, chunks (seed masked)

| Label | n | Accuracy |
| --- | --- | --- |
| high | 65 | 0.80 |
| med | 16 | 0.56 |
| low | 1 | 0.00 |

Consistency histogram: {'0.0': 1, '0.2': 1, '0.6': 2, '0.8': 7, '1.0': 71}

### Calibration, alternatives (seed masked)

| Label | n | Accuracy |
| --- | --- | --- |
| high | 37 | 0.70 |
| med | 50 | 0.46 |
| low | 7 | 0.00 |

Consistency histogram: {'0.0': 8, '0.2': 6, '0.4': 8, '0.6': 9, '0.8': 17, '1.0': 46}

### How the answers were checked

Items per tier with each kind of check (an item can have several).

| Tier | Items | Native | Reference | Author | Unchecked |
| --- | --- | --- | --- | --- | --- |
| advanced | 15 | 0 | 3 | 15 | 0 |
| calque | 9 | 0 | 3 | 9 | 0 |
| regional | 18 | 0 | 5 | 18 | 0 |
| simple | 18 | 0 | 2 | 18 | 0 |

### Failing items

- `bill-01`
- `break-01`
- `delicious-01`
- `give-up-01`
- `hurry-01`
- `kids-01`
- `my-turn-01`
- `strawberry-01`
- `take-care-01`
