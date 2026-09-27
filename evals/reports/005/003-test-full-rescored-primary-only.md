# Eval run 20260925T213812Z (re-scored)

prompt `p1` · split `test` · confidence `full` · model `claude-sonnet-5` · verifier `gpt-5.4-mini`

Compared with: `20260925T213812Z-p1-test-full.summary.json`

| Metric | Value | Δ vs previous |
| --- | --- | --- |
| items | 15 | ±0.00 |
| chunk recall | 1.00 | ±0.00 |
| calque rate | 0.00 | ±0.00 |
| region precision | 0.89 |  |
| over-tagging rate | 0.12 |  |

Region scoring: 24 of 63 chunks and alternatives matched an expected chunk (39 unmatched, excluded); 27 tags scored; 2 of 16 matches on neutral-only expectations carried a country tag.
| chunks: high precision (seed masked) | 0.62 | ±0.00 |
| chunks: high coverage (seed masked) | 0.67 | ±0.00 |
| chunks: base rate (matches expected) | 0.54 | ±0.00 |
| chunks: verifier agree rate | 0.75 | ±0.00 |
| alternatives: high precision (seed masked) | 0.67 | ±0.00 |
| alternatives: high coverage (seed masked) | 0.23 | ±0.00 |
| alternatives: base rate (matches expected) | 0.28 | ±0.00 |
| alternatives: verifier agree rate | 0.72 | ±0.00 |

### Calibration, chunks (seed masked)

| Label | n | Accuracy |
| --- | --- | --- |
| high | 16 | 0.62 |
| med | 8 | 0.38 |

Consistency histogram: {'0.4': 1, '0.6': 1, '1.0': 22}

### Calibration, alternatives (seed masked)

| Label | n | Accuracy |
| --- | --- | --- |
| high | 9 | 0.67 |
| med | 25 | 0.16 |
| low | 5 | 0.20 |

Consistency histogram: {'0.0': 4, '0.2': 4, '0.4': 4, '0.6': 5, '0.8': 7, '1.0': 15}

### How the answers were checked

Items per tier with each kind of check (an item can have several).

| Tier | Items | Native | Reference | Author | Unchecked |
| --- | --- | --- | --- | --- | --- |
| advanced | 4 | 0 | 3 | 4 | 0 |
| calque | 3 | 0 | 3 | 3 | 0 |
| regional | 4 | 0 | 4 | 4 | 0 |
| simple | 4 | 0 | 2 | 4 | 0 |

### Newly failing items

None.
