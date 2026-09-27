# Eval run 20260927T075625Z

prompt `p1` · split `test` · confidence `fast` · model `claude-sonnet-5` · verifier `–`

Compared with: `20260927T062833Z-p1-test-fast.summary.json`

| Metric | Value | Δ vs previous |
| --- | --- | --- |
| items | 60 | ±0.00 |
| chunk recall | 0.83 | ±0.00 |
| calque rate | 0.00 | ±0.00 |
| region precision | 0.89 | +0.01 |
| over-tagging rate | 0.05 | -0.04 |

Region scoring: 111 of 206 chunks and alternatives matched an expected chunk (95 unmatched, excluded); 129 tags scored; 4 of 76 matches on neutral-only expectations carried a country tag.

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
