"""Eval runner placeholder. The real harness lands with feature 001.

Planned interface (see docs/specs/ARCHITECTURE.md):
    run.py --prompt p3 --model primary --verifier secondary --split test
It will call the running chunk service over HTTP and emit JSONL results
plus a Markdown report with metric deltas against the previous run.
"""

import sys


def main() -> int:
    print(__doc__)
    return 0


if __name__ == "__main__":
    sys.exit(main())
