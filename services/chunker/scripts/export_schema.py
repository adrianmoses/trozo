"""Export the API contract as JSON Schema for packages/schema.

    uv run scripts/export_schema.py

Writes packages/schema/chunk.schema.json with ChunkRequest and
ChunkResponse under $defs, which json-schema-to-typescript turns into TS
types (pnpm --filter @trozo/schema generate).
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1]))

from pydantic.json_schema import models_json_schema

from app.models import ChunkRequest, ChunkResponse, ErrorResponse

OUT = Path(__file__).parents[3] / "packages" / "schema" / "chunk.schema.json"


def main() -> None:
    _, top = models_json_schema(
        [(ChunkRequest, "validation"), (ChunkResponse, "validation"), (ErrorResponse, "validation")],
        ref_template="#/$defs/{model}",
    )
    schema = {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "title": "TrozoChunkAPI",
        "description": "trozo chunk service API contract, generated from Pydantic. Do not edit.",
        **top,
    }
    OUT.write_text(json.dumps(schema, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
