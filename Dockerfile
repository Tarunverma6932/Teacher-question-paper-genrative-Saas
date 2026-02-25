FROM python:3.12-slim

WORKDIR /app
COPY . /app

ENV HOST=0.0.0.0
ENV PORT=8000
ENV DATABASE_PATH=/app/backend/data/app.db

RUN mkdir -p /app/backend/data

EXPOSE 8000
CMD ["python", "backend/server.py"]
