# Build from the repo root so the seed can be baked in (006):
#   docker build -f services/chunker/Dockerfile .
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

WORKDIR /app

COPY services/chunker/pyproject.toml services/chunker/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY services/chunker/app ./app
COPY services/chunker/prompts ./prompts
# The seed ships with the image: a Fly machine has no repo mount, and without
# it no chunk is ever seed-verified.
COPY evals/seed/seed_v1.yaml ./seed/seed_v1.yaml

ENV CHUNKER_SEED_PATH=/app/seed/seed_v1.yaml \
    CHUNKER_CACHE_DIR=/app/.cache/chunker

EXPOSE 8000
CMD ["uv", "run", "--no-sync", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
