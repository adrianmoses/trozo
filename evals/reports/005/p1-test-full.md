# Eval run 20260927T080923Z

prompt `p1` · split `test` · confidence `full` · model `claude-sonnet-5` · verifier `gpt-5.4-mini`

Compared with: `20260927T063750Z-p1-test-full.summary.json`

| Metric | Value | Δ vs previous |
| --- | --- | --- |
| items | 60 | ±0.00 |
| chunk recall | 0.83 | ±0.00 |
| calque rate | 0.00 | ±0.00 |
| region precision | 0.89 | +0.01 |
| over-tagging rate | 0.05 | -0.04 |

Region scoring: 111 of 206 chunks and alternatives matched an expected chunk (95 unmatched, excluded); 129 tags scored; 4 of 76 matches on neutral-only expectations carried a country tag.
| chunks: high precision (seed masked) | 0.83 | ±0.00 |
| chunks: high coverage (seed masked) | 0.72 | +0.02 |
| chunks: base rate (matches expected) | 0.69 | -0.01 |
| chunks: verifier agree rate | 0.80 | +0.02 |
| alternatives: high precision (seed masked) | 0.65 | -0.01 |
| alternatives: high coverage (seed masked) | 0.41 | +0.08 |
| alternatives: base rate (matches expected) | 0.42 | -0.07 |
| alternatives: verifier agree rate | 0.81 | +0.06 |

### Calibration, chunks (seed masked)

| Label | n | Accuracy |
| --- | --- | --- |
| high | 63 | 0.83 |
| med | 24 | 0.38 |
| low | 1 | 0.00 |

Consistency histogram: {'0.0': 1, '0.4': 2, '0.6': 2, '0.8': 6, '1.0': 77}

### Calibration, alternatives (seed masked)

| Label | n | Accuracy |
| --- | --- | --- |
| high | 48 | 0.65 |
| med | 61 | 0.30 |
| low | 9 | 0.11 |

Consistency histogram: {'0.0': 9, '0.2': 11, '0.4': 9, '0.6': 18, '0.8': 17, '1.0': 54}

### How the answers were checked

Items per tier with each kind of check (an item can have several).

| Tier | Items | Native | Reference | Author | Unchecked |
| --- | --- | --- | --- | --- | --- |
| advanced | 15 | 0 | 3 | 15 | 0 |
| calque | 9 | 0 | 3 | 9 | 0 |
| regional | 18 | 0 | 5 | 18 | 0 |
| simple | 18 | 0 | 2 | 18 | 0 |

### Newly failing items

- `hot-01`
- `soup-cold-01`
