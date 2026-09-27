# Eval run 20260925T213812Z (re-scored)

prompt `p1` · split `dev` · confidence `full` · model `claude-sonnet-5` · verifier `gpt-5.4-mini`

Compared with: `20260925T213812Z-p1-dev-full.summary.json`

| Metric | Value | Δ vs previous |
| --- | --- | --- |
| items | 15 | ±0.00 |
| chunk recall | 1.00 | +0.02 |
| calque rate | 0.00 | ±0.00 |
| region precision | 0.90 |  |
| over-tagging rate | 0.06 |  |

Region scoring: 45 of 50 chunks and alternatives matched an expected chunk (5 unmatched, excluded); 51 tags scored; 2 of 31 matches on neutral-only expectations carried a country tag.
| chunks: high precision (seed masked) | 1.00 | ±0.00 |
| chunks: high coverage (seed masked) | 0.65 | ±0.00 |
| chunks: base rate (matches expected) | 0.95 | +0.25 |
| chunks: verifier agree rate | 0.70 | ±0.00 |
| alternatives: high precision (seed masked) | 0.85 | +0.31 |
| alternatives: high coverage (seed masked) | 0.43 | ±0.00 |
| alternatives: base rate (matches expected) | 0.87 | +0.60 |
| alternatives: verifier agree rate | 0.80 | ±0.00 |

### Calibration, chunks (seed masked)

| Label | n | Accuracy |
| --- | --- | --- |
| high | 13 | 1.00 |
| med | 6 | 0.83 |
| low | 1 | 1.00 |

Consistency histogram: {'0.4': 1, '0.8': 2, '1.0': 17}

### Calibration, alternatives (seed masked)

| Label | n | Accuracy |
| --- | --- | --- |
| high | 13 | 0.85 |
| med | 16 | 0.88 |
| low | 1 | 1.00 |

Consistency histogram: {'0.0': 1, '0.2': 1, '0.4': 4, '0.6': 1, '0.8': 7, '1.0': 16}

### How the answers were checked

Items per tier with each kind of check (an item can have several).

| Tier | Items | Native | Reference | Author | Unchecked |
| --- | --- | --- | --- | --- | --- |
| advanced | 3 | 0 | 1 | 3 | 0 |
| calque | 2 | 0 | 2 | 2 | 0 |
| regional | 5 | 0 | 5 | 5 | 0 |
| simple | 5 | 0 | 4 | 5 | 0 |

### Newly failing items

None.
