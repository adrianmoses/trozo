# Eval run 20260927T080012Z

prompt `p2` · split `dev` · confidence `fast` · model `claude-sonnet-5` · verifier `–`

Compared with: `20260927T075126Z-p2-dev-fast.summary.json`

| Metric | Value | Δ vs previous |
| --- | --- | --- |
| items | 60 | ±0.00 |
| chunk recall | 0.94 | -0.02 |
| calque rate | 0.02 | +0.02 |
| region precision | 0.91 | +0.03 |
| over-tagging rate | 0.07 | -0.03 |

Region scoring: 129 of 186 chunks and alternatives matched an expected chunk (57 unmatched, excluded); 141 tags scored; 6 of 81 matches on neutral-only expectations carried a country tag.

### How the answers were checked

Items per tier with each kind of check (an item can have several).

| Tier | Items | Native | Reference | Author | Unchecked |
| --- | --- | --- | --- | --- | --- |
| advanced | 15 | 0 | 1 | 15 | 0 |
| calque | 9 | 0 | 2 | 9 | 0 |
| regional | 18 | 0 | 8 | 18 | 0 |
| simple | 18 | 0 | 4 | 18 | 0 |

### Newly failing items

- `annoying-01`
- `dream-about-01`
- `right-01`
