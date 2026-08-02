# Build from backend/runtimes:
#   docker build --build-arg SERVICE=de_rag -t de-rag .
FROM python:3.12-slim
WORKDIR /app
ARG SERVICE=de_agent_runtime
COPY . /src
WORKDIR /src/${SERVICE}
RUN if [ "$SERVICE" = "de_rag" ]; then pip install --no-cache-dir -r /src/de_rag/requirements.txt; fi
ENV PYTHONUNBUFFERED=1
ENV DE_BIND_HOST=0.0.0.0
EXPOSE 8091 8092 8093
CMD ["python3", "main.py"]
