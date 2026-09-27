# Eval run 20260927T075126Z

prompt `p2` · split `dev` · confidence `fast` · model `claude-sonnet-5` · verifier `–`

Compared with: `20260927T071331Z-p2-dev-fast.summary.json`

| Metric | Value | Δ vs previous |
| --- | --- | --- |
| items | 60 | ±0.00 |
| chunk recall | 0.96 | +0.09 |
| calque rate | 0.00 | ±0.00 |
| region precision | 0.88 | -0.02 |
| over-tagging rate | 0.10 | +0.05 |

Region scoring: 134 of 215 chunks and alternatives matched an expected chunk (81 unmatched, excluded); 148 tags scored; 9 of 86 matches on neutral-only expectations carried a country tag.

### How the answers were checked

Items per tier with each kind of check (an item can have several).

| Tier | Items | Native | Reference | Author | Unchecked |
| --- | --- | --- | --- | --- | --- |
| advanced | 15 | 0 | 1 | 15 | 0 |
| calque | 9 | 0 | 2 | 9 | 0 |
| regional | 18 | 0 | 8 | 18 | 0 |
| simple | 18 | 0 | 4 | 18 | 0 |

### Newly failing items

- `cool-01`
- `excited-party-01`
