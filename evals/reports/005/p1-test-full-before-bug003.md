# Eval run 20260927T063750Z

prompt `p1` · split `test` · confidence `full` · model `claude-sonnet-5` · verifier `gpt-5.4-mini`

Compared with: `20260925T213812Z-p1-test-full.summary.json`

| Metric | Value | Δ vs previous |
| --- | --- | --- |
| items | 60 | +45.00 |
| chunk recall | 0.83 | -0.17 |
| calque rate | 0.00 | ±0.00 |
| region precision | 0.88 |  |
| over-tagging rate | 0.09 |  |

Region scoring: 125 of 216 chunks and alternatives matched an expected chunk (91 unmatched, excluded); 139 tags scored; 8 of 86 matches on neutral-only expectations carried a country tag.
| chunks: high precision (seed masked) | 0.83 | +0.20 |
| chunks: high coverage (seed masked) | 0.70 | +0.03 |
| chunks: base rate (matches expected) | 0.70 | +0.16 |
| chunks: verifier agree rate | 0.78 | +0.03 |
| alternatives: high precision (seed masked) | 0.66 | -0.01 |
| alternatives: high coverage (seed masked) | 0.33 | +0.09 |
| alternatives: base rate (matches expected) | 0.49 | +0.21 |
| alternatives: verifier agree rate | 0.75 | +0.04 |

### Calibration, chunks (seed masked)

| Label | n | Accuracy |
| --- | --- | --- |
| high | 63 | 0.83 |
| med | 25 | 0.44 |
| low | 2 | 0.00 |

Consistency histogram: {'0.2': 1, '0.4': 3, '0.6': 4, '0.8': 4, '1.0': 78}

### Calibration, alternatives (seed masked)

| Label | n | Accuracy |
| --- | --- | --- |
| high | 41 | 0.66 |
| med | 73 | 0.44 |
| low | 12 | 0.25 |

Consistency histogram: {'0.0': 9, '0.2': 13, '0.4': 17, '0.6': 12, '0.8': 21, '1.0': 54}

### How the answers were checked

Items per tier with each kind of check (an item can have several).

| Tier | Items | Native | Reference | Author | Unchecked |
| --- | --- | --- | --- | --- | --- |
| advanced | 15 | 0 | 3 | 15 | 0 |
| calque | 9 | 0 | 3 | 9 | 0 |
| regional | 18 | 0 | 5 | 18 | 0 |
| simple | 18 | 0 | 2 | 18 | 0 |

### Newly failing items

- `break-01`
- `cold-outside-01`
- `delicious-01`
- `give-up-01`
- `kids-01`
- `married-to-01`
- `peach-01`
- `pickup-01`
- `shower-01`
- `strawberry-01`
