"""Poison-claim check for the verifier (feature 003).

    uv run scripts/poison.py [--model gpt-5.4-mini]

Sends evals/seed/poison_v0.yaml through the verifier in one batched call,
the same way full mode does, and reports the catch rate on deliberately
wrong claims and the acceptance rate on true controls. Writes JSONL to
evals/results/.
"""

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).parents[1]))

from app.llm import OpenAILLMClient  # noqa: E402
from app.pipeline.full import VERIFIER_SYSTEM, Claim, VerifierAnswers, verifier_user_message  # noqa: E402

ROOT = Path(__file__).parents[3]
POISON = ROOT / "evals" / "seed" / "poison_v0.yaml"
RESULTS = ROOT / "evals" / "results"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default=None, help="verifier model (default: CHUNKER_VERIFIER_MODEL)")
    args = ap.parse_args()
    items = yaml.safe_load(POISON.read_text(encoding="utf-8"))
    verifier = OpenAILLMClient(args.model)
    claims = [Claim(id=i["id"], text=i["claim"]) for i in items]
    result = verifier.generate_structured(VERIFIER_SYSTEM, verifier_user_message(claims), VerifierAnswers)
    answers = {a.id: a for a in result.answers}

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out = RESULTS / f"{stamp}-poison-{verifier.model}.jsonl"
    with out.open("w", encoding="utf-8") as f:
        for i in items:
            a = answers.get(i["id"])
            f.write(json.dumps({**i, "answer": a.answer if a else None, "reason": a.reason if a else None}, ensure_ascii=False) + "\n")

    false_items = [i for i in items if not i["truth"]]
    true_items = [i for i in items if i["truth"]]
    caught = [i for i in false_items if (answers.get(i["id"]) and answers[i["id"]].answer == "no")]
    accepted = [i for i in true_items if (answers.get(i["id"]) and answers[i["id"]].answer == "yes")]
    print(f"verifier: {verifier.model}")
    print(f"poison caught:     {len(caught)}/{len(false_items)} = {len(caught) / len(false_items):.0%}")
    print(f"controls accepted: {len(accepted)}/{len(true_items)} = {len(accepted) / len(true_items):.0%}")
    missed = [i["id"] for i in false_items if i not in caught]
    rejected = [i["id"] for i in true_items if i not in accepted]
    if missed:
        print("missed:", missed)
    if rejected:
        print("controls rejected:", rejected)
    print(f"results: {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
