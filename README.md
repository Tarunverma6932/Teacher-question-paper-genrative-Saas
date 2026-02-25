# EduAssess Pro - Teacher Question Paper Generative SaaS

EduAssess Pro is a full-stack SaaS platform for teachers and students to generate summative assessment papers from chapter PDFs and publish them to a shared student feed.

## Live product capabilities

- Teacher and student authentication (real backend auth)
- Role-based dashboards
- Teacher profile + Google Drive folder linking
- PDF-to-question generation with pattern controls:
  - MCQ
  - Very Short
  - Short
  - Long
- Assessment publish flow to shared student feed
- Teacher analytics dashboard
- Teacher published-paper history (review + delete)
- Export paper as text + print support
- Student view with answer key hidden

## Architecture

- Frontend: `index.html`, `styles.css`, `app.js`, `config.js`
- Backend API: `backend/server.py`
- Database: SQLite (`backend/data/app.db` by default)
- Deployment config: `render.yaml`, `Procfile`, `Dockerfile`
- CI and tests: `.github/workflows/ci.yml`, `tests/test_backend_core.py`

## API endpoints

- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `PUT /api/profile`
- `POST /api/drive`
- `POST /api/assessments/generate`
- `POST /api/assessments`
- `GET /api/assessments`
- `DELETE /api/assessments/:id`
- `GET /api/teacher/summary`

## Local run

```bash
cd "/Users/tarunverma/Documents/New project"
./run-local.sh
```

Open:

- `http://localhost:8000`

Notes:

- Do not run via `file://...` for full API behavior.
- If frontend is on `localhost:5500`, it auto-routes API to `http://localhost:8000`.

## Test and checks

```bash
make check
make test
```

## Docker run

```bash
docker build -t eduassess-pro .
docker run --rm -p 8000:8000 eduassess-pro
```

## Deployment (Render)

1. Push repo to GitHub.
2. Create a new Render **Blueprint** from this repo.
3. Render reads `render.yaml` and deploys web service + persistent disk.
4. Verify health endpoint: `/api/health`.

## Environment variables

Copy `.env.example` values as needed:

- `HOST`
- `PORT`
- `DATABASE_PATH`
- `CORS_ORIGIN`
- `TOKEN_TTL_DAYS`
- `PASSWORD_MIN_LENGTH`
- `MAX_TEXT_CHARS`

## Demo accounts (seeded)

- Teacher: `teacher@demo.com` / `teacher123`
- Student: `student@demo.com` / `student123`

## Client pitch assets

- `PITCH_BRIEF.md`
- `DEMO_SCRIPT.md`
- `CLIENT_HANDOFF.md`

## Production roadmap

- PostgreSQL migration for scale
- Google OAuth + Drive API integration
- Advanced AI generation quality controls
- Admin and multi-tenant school management
