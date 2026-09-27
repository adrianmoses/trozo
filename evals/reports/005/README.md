# Feature 005 reports

Copies of the runs behind the numbers in the top-level README (`evals/results/` is gitignored). Each `.md` is the runner's report; `.summary.json` is its machine-readable summary.

| File                                                       | What it is                                                         |
| ---------------------------------------------------------- | ------------------------------------------------------------------ |
| `p1-test-fast`, `p1-test-full`                             | p1 (default prompt) on the 60 test items, after bug 003            |
| `p2-test-fast`, `p2-test-full`                             | the frozen p2, run once on test                                    |
| `p1-dev-fast`, `p1-dev-full`                               | p1 on dev: the baseline p2 was chosen from                         |
| `p1-dev-threshold-sweep.txt`                               | `tune.py` on `p1-dev-full`: T_high 1.0 and T_med 0.6 kept          |
| `p2-dev-fast-iter2`, `p2-dev-fast-iter3`                   | p2 dev iterations after bug 003 (iteration 3 is the frozen prompt) |
| `p1-test-fast-before-bug003`, `p1-test-full-before-bug003` | p1 on test with the validator bug still in place                   |
| `003-{dev,test}-full-rescored-primary-only`                | 003's stored runs re-scored as in 003 (one answer per chunk)       |
| `003-{dev,test}-full-rescored-full-key`                    | the same runs re-scored with `accepted:` and `also_valid:`         |
