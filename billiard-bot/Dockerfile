# Базовый образ можно заменить зеркалом, если Docker Hub недоступен:
#   docker compose build --build-arg BASE_IMAGE=mirror.gcr.io/library/python:3.13-slim
ARG BASE_IMAGE=python:3.13-slim
FROM ${BASE_IMAGE}

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    DATABASE_PATH=/app/data/bot.db

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY app ./app
COPY config ./config
COPY assets ./assets
COPY scripts/backup_db.py ./scripts/backup_db.py

RUN useradd --create-home --uid 10001 bot \
    && mkdir -p /app/data /app/backups \
    && chown -R bot:bot /app/data /app/backups

USER bot

CMD ["python", "-m", "app"]
