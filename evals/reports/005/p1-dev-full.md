# Eval run 20260927T080237Z

prompt `p1` · split `dev` · confidence `full` · model `claude-sonnet-5` · verifier `gpt-5.4-mini`

Compared with: `20260927T063247Z-p1-dev-full.summary.json`

| Metric | Value | Δ vs previous |
| --- | --- | --- |
| items | 60 | ±0.00 |
| chunk recall | 0.92 | +0.07 |
| calque rate | 0.00 | ±0.00 |
| region precision | 0.86 | -0.02 |
| over-tagging rate | 0.09 | -0.01 |

Region scoring: 126 of 210 chunks and alternatives matched an expected chunk (84 unmatched, excluded); 143 tags scored; 7 of 75 matches on neutral-only expectations carried a country tag.
| chunks: high precision (seed masked) | 0.84 | +0.03 |
| chunks: high coverage (seed masked) | 0.64 | -0.07 |
| chunks: base rate (matches expected) | 0.72 | -0.03 |
| chunks: verifier agree rate | 0.71 | -0.08 |
| alternatives: high precision (seed masked) | 0.75 | +0.11 |
| alternatives: high coverage (seed masked) | 0.43 | -0.01 |
| alternatives: base rate (matches expected) | 0.52 | -0.02 |
| alternatives: verifier agree rate | 0.80 | +0.01 |

### Calibration, chunks (seed masked)

| Label | n | Accuracy |
| --- | --- | --- |
| high | 55 | 0.84 |
| med | 28 | 0.54 |
| low | 3 | 0.33 |

Consistency histogram: {'0.0': 1, '0.2': 1, '0.4': 1, '0.6': 4, '0.8': 6, '1.0': 73}

### Calibration, alternatives (seed masked)

| Label | n | Accuracy |
| --- | --- | --- |
| high | 53 | 0.75 |
| med | 65 | 0.37 |
| low | 6 | 0.00 |

Consistency histogram: {'0.0': 8, '0.2': 10, '0.4': 9, '0.6': 13, '0.8': 20, '1.0': 64}

### How the answers were checked

Items per tier with each kind of check (an item can have several).

| Tier | Items | Native | Reference | Author | Unchecked |
| --- | --- | --- | --- | --- | --- |
| advanced | 15 | 0 | 1 | 15 | 0 |
| calque | 9 | 0 | 2 | 9 | 0 |
| regional | 18 | 0 | 8 | 18 | 0 |
| simple | 18 | 0 | 4 | 18 | 0 |

### Newly failing items

None.
