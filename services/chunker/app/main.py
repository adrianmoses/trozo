from fastapi import FastAPI

app = FastAPI(title="trozo chunk service")


@app.get("/v1/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
