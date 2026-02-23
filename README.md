# EduAssess Pro (Teacher/Student SaaS MVP)

EduAssess Pro is a clean blue/white web platform prototype for teachers and students.

## What this build includes

- Sign In / Sign Up flow
- Teacher and Student profile views
- Teacher dashboard with PDF upload
- Pattern-based question generation:
  - MCQ
  - Very short answer
  - Short answer
  - Long answer
- Google Drive folder connection link
- Publish generated assessments for student feed
- Student dashboard to view published assessments

## Stack

- `index.html`
- `styles.css`
- `app.js`
- Browser localStorage as data store (MVP only)
- PDF text extraction via `pdf.js` CDN

## Run locally

1. Open `/Users/tarunverma/Documents/New project/index.html` directly in a browser.
2. Or run a local server from the project root:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Demo credentials

- Teacher: `teacher@demo.com` / `teacher123`
- Student: `student@demo.com` / `student123`

## Notes for production SaaS

This MVP is frontend-only. For production, add:

- Real authentication (OAuth/JWT/session)
- Secure backend + database (PostgreSQL/MySQL)
- Role-based access control
- AI/LLM service for higher-quality question generation
- Real Google Drive OAuth + Drive API integration
- PDF processing pipeline on server side
- Audit logs and analytics
