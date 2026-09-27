# Eval run 20260927T062833Z

prompt `p1` · split `test` · confidence `fast` · model `claude-sonnet-5` · verifier `–`

Compared with: `20260925T213811Z-p1-test-fast.summary.json`

| Metric | Value | Δ vs previous |
| --- | --- | --- |
| items | 60 | +45.00 |
| chunk recall | 0.83 | -0.17 |
| calque rate | 0.00 | ±0.00 |
| region precision | 0.88 |  |
| over-tagging rate | 0.09 |  |

Region scoring: 125 of 216 chunks and alternatives matched an expected chunk (91 unmatched, excluded); 139 tags scored; 8 of 86 matches on neutral-only expectations carried a country tag.

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
