# Teacher Question Paper Generative SaaS

A full-stack SaaS platform for teachers and students:

- Teacher uploads chapter/book PDF
- Teacher sets assessment pattern (`MCQ`, `Very Short`, `Short`, `Long`)
- Platform generates a summative assessment paper
- Teacher publishes paper
- Students see shared published papers from all teachers
- Real authentication and shared database-backed APIs

## Architecture

- Frontend: `/Users/tarunverma/Documents/New project/index.html`, `/Users/tarunverma/Documents/New project/styles.css`, `/Users/tarunverma/Documents/New project/app.js`
- Backend API: `/Users/tarunverma/Documents/New project/backend/server.py`
- Database: SQLite (`/Users/tarunverma/Documents/New project/backend/data/app.db` by default)

## Core features implemented

- Auth:
  - Register
  - Login
  - Token-based session auth (Bearer token)
  - Logout
  - Authenticated `me` endpoint
- Profiles:
  - Teacher and student profiles
  - Update institution/track
- Teacher tools:
  - Connect Google Drive folder URL
  - Generate paper from uploaded PDF text and pattern counts
  - Publish assessment
- Student feed:
  - Shared published assessments across users
  - Answers hidden for student role

## API endpoints

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `PUT /api/profile`
- `POST /api/drive`
- `POST /api/assessments/generate`
- `POST /api/assessments`
- `GET /api/assessments`
- `GET /api/health`

## Run locally

From `/Users/tarunverma/Documents/New project`:

```bash
python3 backend/server.py
```

Open:

- `http://localhost:8000`

## Demo accounts (seeded automatically)

- Teacher: `teacher@demo.com` / `teacher123`
- Student: `student@demo.com` / `student123`

## Deploy on internet (Render)

This repo includes `/Users/tarunverma/Documents/New project/render.yaml`.

### Steps

1. Push repo to GitHub.
2. In Render, create a new **Blueprint** from your GitHub repo.
3. Render will detect `render.yaml` and deploy automatically.
4. After deploy, open your Render service URL and use the app.

If frontend and backend are hosted on different domains:

1. Edit `/Users/tarunverma/Documents/New project/config.js`
2. Set `window.__API_BASE__` to your backend URL
3. Redeploy frontend

## Environment variables

- `PORT` (set by platform)
- `HOST` (default: `0.0.0.0`)
- `DATABASE_PATH` (optional custom DB path)
- `CORS_ORIGIN` (default: `*`)
- `TOKEN_TTL_DAYS` (default: `7`)

## Notes

- GitHub Pages is static-only and cannot run this backend.
- For production scale, next upgrade should be PostgreSQL + managed auth + background jobs for heavier PDF/AI workloads.
