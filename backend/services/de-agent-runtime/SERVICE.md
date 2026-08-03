# de-agent-runtime

FastAPI agent runtime on port **8091**.

## Endpoints

- `GET /healthz` — `{status, service: agent-runtime, mode}`
- `POST /v1/invoke` — `{output, graph, nodes, provider}`

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `DE_BIND_HOST` | `127.0.0.1` | Bind address |
| `DE_BIND_PORT` | `8091` | Bind port |
| `DE_LLM_BASE_URL` | — | OpenAI-compatible base URL |
| `DE_LLM_API_KEY` | — | API key |
| `DE_LLM_MODEL` | `gpt-4o-mini` | Model name |
| `DE_LLM_TIMEOUT` | `20` | Request timeout (seconds) |

## Run locally

```bash
cd backend
pip install -r services/de-agent-runtime/requirements.txt
python3 runtimes/de_agent_runtime/main.py
# or
cd services/de-agent-runtime && uvicorn app.main:app --host 127.0.0.1 --port 8091
```

## Docker

```bash
docker build -t de-agent-runtime:local backend/services/de-agent-runtime
docker run -p 8091:8091 de-agent-runtime:local
```
