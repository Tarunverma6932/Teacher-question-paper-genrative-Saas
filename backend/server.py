#!/usr/bin/env python3
import hashlib
import json
import os
import secrets
import sqlite3
import threading
import uuid
from datetime import datetime, timedelta, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT_DIR = Path(__file__).resolve().parents[1]
DEFAULT_DB_PATH = ROOT_DIR / "backend" / "data" / "app.db"
DB_PATH = Path(os.getenv("DATABASE_PATH", str(DEFAULT_DB_PATH))).resolve()
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))
CORS_ORIGIN = os.getenv("CORS_ORIGIN", "*")
TOKEN_TTL_DAYS = int(os.getenv("TOKEN_TTL_DAYS", "7"))

STOP_WORDS = {
    "about",
    "above",
    "after",
    "again",
    "against",
    "all",
    "also",
    "among",
    "and",
    "any",
    "are",
    "because",
    "been",
    "before",
    "being",
    "below",
    "between",
    "both",
    "but",
    "can",
    "could",
    "did",
    "does",
    "each",
    "few",
    "for",
    "from",
    "had",
    "has",
    "have",
    "here",
    "into",
    "its",
    "more",
    "most",
    "other",
    "our",
    "out",
    "over",
    "some",
    "such",
    "than",
    "that",
    "their",
    "them",
    "then",
    "there",
    "these",
    "they",
    "this",
    "those",
    "through",
    "under",
    "very",
    "what",
    "when",
    "where",
    "which",
    "while",
    "with",
    "would",
    "your",
}


class APIError(Exception):
    def __init__(self, status, message):
        self.status = status
        self.message = message
        super().__init__(message)


class Database:
    def __init__(self, path: Path):
        self.conn = sqlite3.connect(path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.lock = threading.Lock()
        self.conn.execute("PRAGMA journal_mode = WAL")
        self.conn.execute("PRAGMA foreign_keys = ON")
        self._initialize()
        self._seed_demo_users()

    def _initialize(self):
        with self.lock:
            self.conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    email TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    password_salt TEXT NOT NULL,
                    role TEXT NOT NULL CHECK(role IN ('teacher', 'student')),
                    institution TEXT DEFAULT '',
                    track TEXT DEFAULT '',
                    drive_url TEXT DEFAULT '',
                    drive_connected_at TEXT,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS auth_tokens (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    token_hash TEXT NOT NULL UNIQUE,
                    expires_at TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS assessments (
                    id TEXT PRIMARY KEY,
                    teacher_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    chapter_title TEXT NOT NULL,
                    pattern_notes TEXT DEFAULT '',
                    questions_json TEXT NOT NULL,
                    published INTEGER NOT NULL DEFAULT 1,
                    published_at TEXT,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(teacher_id) REFERENCES users(id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_auth_tokens_hash ON auth_tokens(token_hash);
                CREATE INDEX IF NOT EXISTS idx_assessments_published ON assessments(published, published_at);
                CREATE INDEX IF NOT EXISTS idx_assessments_teacher ON assessments(teacher_id, created_at);
                """
            )
            self.conn.commit()

    def _seed_demo_users(self):
        demo_users = [
            {
                "name": "Riya Sharma",
                "email": "teacher@demo.com",
                "password": "teacher123",
                "role": "teacher",
                "institution": "Blue Valley School",
                "track": "Science",
            },
            {
                "name": "Aman Gupta",
                "email": "student@demo.com",
                "password": "student123",
                "role": "student",
                "institution": "Blue Valley School",
                "track": "Grade 8",
            },
        ]

        for user in demo_users:
            if not self.get_user_by_email(user["email"]):
                self.create_user(
                    name=user["name"],
                    email=user["email"],
                    password=user["password"],
                    role=user["role"],
                    institution=user["institution"],
                    track=user["track"],
                )

    def create_user(self, name, email, password, role, institution="", track=""):
        password_hash, password_salt = hash_password(password)
        now = utc_now_iso()
        user_id = str(uuid.uuid4())

        with self.lock:
            self.conn.execute(
                """
                INSERT INTO users (id, name, email, password_hash, password_salt, role, institution, track, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    user_id,
                    name,
                    email,
                    password_hash,
                    password_salt,
                    role,
                    institution,
                    track,
                    now,
                ),
            )
            self.conn.commit()

        return self.get_user_by_id(user_id)

    def get_user_by_email(self, email):
        row = self.conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        return row

    def get_user_by_id(self, user_id):
        row = self.conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        return row

    def verify_user_credentials(self, email, password):
        user = self.get_user_by_email(email)
        if not user:
            return None

        expected_hash = user["password_hash"]
        salt = user["password_salt"]
        candidate_hash, _ = hash_password(password, salt)
        if not secrets.compare_digest(expected_hash, candidate_hash):
            return None

        return user

    def issue_token(self, user_id):
        token = secrets.token_urlsafe(48)
        token_hash = sha256_text(token)
        now = utc_now()
        expires = now + timedelta(days=TOKEN_TTL_DAYS)

        with self.lock:
            self.conn.execute(
                "INSERT INTO auth_tokens (user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?)",
                (user_id, token_hash, expires.isoformat(), now.isoformat()),
            )
            self.conn.commit()

        return token

    def revoke_token(self, token):
        token_hash = sha256_text(token)
        with self.lock:
            self.conn.execute("DELETE FROM auth_tokens WHERE token_hash = ?", (token_hash,))
            self.conn.commit()

    def user_from_token(self, token):
        token_hash = sha256_text(token)
        now = utc_now_iso()
        row = self.conn.execute(
            """
            SELECT u.*
            FROM auth_tokens t
            JOIN users u ON u.id = t.user_id
            WHERE t.token_hash = ? AND t.expires_at > ?
            LIMIT 1
            """,
            (token_hash, now),
        ).fetchone()
        return row

    def update_profile(self, user_id, institution, track):
        with self.lock:
            self.conn.execute(
                "UPDATE users SET institution = ?, track = ? WHERE id = ?",
                (institution, track, user_id),
            )
            self.conn.commit()

        return self.get_user_by_id(user_id)

    def update_drive_link(self, user_id, drive_url):
        now = utc_now_iso()
        with self.lock:
            self.conn.execute(
                "UPDATE users SET drive_url = ?, drive_connected_at = ? WHERE id = ?",
                (drive_url, now, user_id),
            )
            self.conn.commit()

        return self.get_user_by_id(user_id)

    def create_assessment(self, teacher_id, title, chapter_title, pattern_notes, questions):
        now = utc_now_iso()
        assessment_id = str(uuid.uuid4())
        questions_json = json.dumps(questions)

        with self.lock:
            self.conn.execute(
                """
                INSERT INTO assessments (
                    id, teacher_id, title, chapter_title, pattern_notes,
                    questions_json, published, published_at, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
                """,
                (
                    assessment_id,
                    teacher_id,
                    title,
                    chapter_title,
                    pattern_notes,
                    questions_json,
                    now,
                    now,
                ),
            )
            self.conn.commit()

        return self.get_assessment_by_id(assessment_id)

    def get_assessment_by_id(self, assessment_id):
        row = self.conn.execute(
            """
            SELECT a.*, u.name AS teacher_name
            FROM assessments a
            JOIN users u ON u.id = a.teacher_id
            WHERE a.id = ?
            LIMIT 1
            """,
            (assessment_id,),
        ).fetchone()
        return row

    def list_assessments_for_user(self, user):
        if user["role"] == "student":
            query = (
                """
                SELECT a.*, u.name AS teacher_name
                FROM assessments a
                JOIN users u ON u.id = a.teacher_id
                WHERE a.published = 1
                ORDER BY a.published_at DESC, a.created_at DESC
                """
            )
            rows = self.conn.execute(query).fetchall()
        else:
            query = (
                """
                SELECT a.*, u.name AS teacher_name
                FROM assessments a
                JOIN users u ON u.id = a.teacher_id
                WHERE a.teacher_id = ? OR a.published = 1
                ORDER BY a.created_at DESC
                """
            )
            rows = self.conn.execute(query, (user["id"],)).fetchall()

        return rows


def utc_now():
    return datetime.now(timezone.utc).replace(microsecond=0)


def utc_now_iso():
    return utc_now().isoformat()


def sha256_text(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def hash_password(password, salt_hex=None):
    if salt_hex:
        salt = bytes.fromhex(salt_hex)
    else:
        salt = secrets.token_bytes(16)

    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 120000)
    return digest.hex(), salt.hex()


def to_public_user(row):
    return {
        "id": row["id"],
        "name": row["name"],
        "email": row["email"],
        "role": row["role"],
        "profile": {
            "institution": row["institution"] or "",
            "track": row["track"] or "",
            "driveUrl": row["drive_url"] or "",
            "driveConnectedAt": row["drive_connected_at"],
        },
    }


def serialize_assessment(row, user_role):
    questions = json.loads(row["questions_json"])
    if user_role == "student":
        questions = strip_answers(questions)

    return {
        "id": row["id"],
        "teacherId": row["teacher_id"],
        "teacherName": row["teacher_name"],
        "title": row["title"],
        "chapterTitle": row["chapter_title"],
        "patternNotes": row["pattern_notes"] or "",
        "questions": questions,
        "published": bool(row["published"]),
        "publishedAt": row["published_at"],
        "createdAt": row["created_at"],
    }


def strip_answers(questions):
    cleaned = {"mcq": [], "veryShort": [], "short": [], "long": []}
    for item in questions.get("mcq", []):
        cleaned["mcq"].append(
            {
                "prompt": item.get("prompt", ""),
                "options": item.get("options", []),
            }
        )

    for section in ("veryShort", "short", "long"):
        for item in questions.get(section, []):
            cleaned[section].append({"prompt": item.get("prompt", "")})

    return cleaned


def normalize_counts(raw_counts):
    if not isinstance(raw_counts, dict):
        raise APIError(400, "counts must be an object")

    result = {}
    for key in ("mcq", "veryShort", "short", "long"):
        value = raw_counts.get(key, 0)
        try:
            parsed = int(value)
        except (TypeError, ValueError):
            raise APIError(400, f"Invalid count for {key}")

        if parsed < 0 or parsed > 30:
            raise APIError(400, f"{key} must be between 0 and 30")
        result[key] = parsed

    if sum(result.values()) <= 0:
        raise APIError(400, "At least one question count is required")

    return result


def extract_keywords(extracted_text, chapter_title):
    source = f"{chapter_title} {extracted_text}".lower()
    filtered = []
    current = []
    for char in source:
        if "a" <= char <= "z" or char == " ":
            current.append(char)
        else:
            current.append(" ")
    cleaned_text = "".join(current)
    for word in cleaned_text.split():
        if len(word) < 4 or word in STOP_WORDS:
            continue
        filtered.append(word)

    counts = {}
    for word in filtered:
        counts[word] = counts.get(word, 0) + 1

    sorted_words = [word for word, _ in sorted(counts.items(), key=lambda pair: pair[1], reverse=True)]
    if len(sorted_words) >= 5:
        return sorted_words[:25]

    fallback = [w for w in chapter_title.lower().split() if len(w) > 3]
    fallback.extend(["definition", "application", "concept", "analysis", "process", "impact"])
    return fallback


def to_title_case(value):
    return " ".join(part[:1].upper() + part[1:] for part in value.split())


def generate_mcqs(keywords, count):
    stems = [
        "Which concept is most closely connected with",
        "Which option best explains",
        "Choose the most appropriate term for",
        "Which idea from the chapter is linked to",
    ]

    output = []
    for i in range(count):
        correct = to_title_case(keywords[i % len(keywords)])
        distractors = []
        for keyword in keywords:
            option = to_title_case(keyword)
            if option != correct and option not in distractors:
                distractors.append(option)
            if len(distractors) == 3:
                break

        while len(distractors) < 3:
            distractors.append(f"Concept {i + len(distractors) + 1}")

        options = [correct] + distractors
        # deterministic shuffle based on question index
        shift = i % len(options)
        options = options[shift:] + options[:shift]

        output.append(
            {
                "prompt": f'{stems[i % len(stems)]} "{correct}"?',
                "options": options,
                "answer": correct,
            }
        )

    return output


def generate_direct_questions(keywords, count, question_type):
    templates = {
        "veryShort": [
            "Define {topic} in one or two lines.",
            "State one key point about {topic}.",
            "Write a very short note on {topic}.",
        ],
        "short": [
            "Explain the significance of {topic} with suitable details.",
            "Describe {topic} with an example from the chapter.",
            "How does {topic} affect the overall concept of this chapter?",
        ],
        "long": [
            "Critically examine {topic} and support your answer with examples.",
            "Discuss {topic} in detail. Include causes, process, and outcomes.",
            "Write a long answer on {topic} and connect it to real-world applications.",
        ],
    }

    output = []
    for i in range(count):
        topic = to_title_case(keywords[i % len(keywords)])
        prompt = templates[question_type][i % len(templates[question_type])].replace("{topic}", topic)
        output.append({"prompt": prompt})

    return output


def build_paper(title, chapter_title, pattern_notes, extracted_text, counts, teacher_name):
    keywords = extract_keywords(extracted_text, chapter_title)
    return {
        "title": title,
        "chapterTitle": chapter_title,
        "patternNotes": pattern_notes,
        "teacherName": teacher_name,
        "questions": {
            "mcq": generate_mcqs(keywords, counts["mcq"]),
            "veryShort": generate_direct_questions(keywords, counts["veryShort"], "veryShort"),
            "short": generate_direct_questions(keywords, counts["short"], "short"),
            "long": generate_direct_questions(keywords, counts["long"], "long"),
        },
    }


DB = Database(DB_PATH)


class APIHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT_DIR), **kwargs)

    def log_message(self, fmt, *args):
        super().log_message(fmt, *args)

    def do_OPTIONS(self):
        if self.path.startswith("/api/"):
            self.send_response(204)
            self._set_cors_headers()
            self.end_headers()
            return
        self.send_response(404)
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/api/"):
            self.handle_api("GET")
            return
        super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/"):
            self.handle_api("POST")
            return
        self.send_error(405)

    def do_PUT(self):
        if self.path.startswith("/api/"):
            self.handle_api("PUT")
            return
        self.send_error(405)

    def handle_api(self, method):
        parsed = urlparse(self.path)
        path = parsed.path

        try:
            if method == "GET" and path == "/api/health":
                return self.send_json(200, {"status": "ok", "time": utc_now_iso()})

            if method == "POST" and path == "/api/auth/register":
                payload = self.read_json_body()
                return self.handle_register(payload)

            if method == "POST" and path == "/api/auth/login":
                payload = self.read_json_body()
                return self.handle_login(payload)

            if method == "POST" and path == "/api/auth/logout":
                user, token = self.require_auth()
                del user
                DB.revoke_token(token)
                return self.send_json(200, {"ok": True})

            if method == "GET" and path == "/api/auth/me":
                user, _ = self.require_auth()
                return self.send_json(200, {"user": to_public_user(user)})

            if method == "PUT" and path == "/api/profile":
                user, _ = self.require_auth()
                payload = self.read_json_body()
                institution = str(payload.get("institution", "")).strip()
                track = str(payload.get("track", "")).strip()
                updated = DB.update_profile(user["id"], institution, track)
                return self.send_json(200, {"user": to_public_user(updated)})

            if method == "POST" and path == "/api/drive":
                user, _ = self.require_auth()
                if user["role"] != "teacher":
                    raise APIError(403, "Only teachers can connect Google Drive")

                payload = self.read_json_body()
                drive_url = str(payload.get("driveUrl", "")).strip()
                if not drive_url.startswith("https://drive.google.com"):
                    raise APIError(400, "Please provide a valid Google Drive URL")

                updated = DB.update_drive_link(user["id"], drive_url)
                return self.send_json(200, {"user": to_public_user(updated)})

            if method == "POST" and path == "/api/assessments/generate":
                user, _ = self.require_auth()
                if user["role"] != "teacher":
                    raise APIError(403, "Only teachers can generate papers")

                payload = self.read_json_body()
                title = str(payload.get("title", "")).strip() or "Summative Assessment"
                chapter_title = str(payload.get("chapterTitle", "")).strip() or "Chapter"
                pattern_notes = str(payload.get("patternNotes", "")).strip()
                extracted_text = str(payload.get("extractedText", ""))
                counts = normalize_counts(payload.get("counts", {}))

                paper = build_paper(
                    title=title,
                    chapter_title=chapter_title,
                    pattern_notes=pattern_notes,
                    extracted_text=extracted_text,
                    counts=counts,
                    teacher_name=user["name"],
                )
                paper["createdAt"] = utc_now_iso()

                return self.send_json(200, {"paper": paper})

            if method == "POST" and path == "/api/assessments":
                user, _ = self.require_auth()
                if user["role"] != "teacher":
                    raise APIError(403, "Only teachers can publish assessments")

                payload = self.read_json_body()
                title = str(payload.get("title", "")).strip()
                chapter_title = str(payload.get("chapterTitle", "")).strip()
                pattern_notes = str(payload.get("patternNotes", "")).strip()
                questions = payload.get("questions")

                if not title:
                    raise APIError(400, "title is required")
                if not chapter_title:
                    raise APIError(400, "chapterTitle is required")
                if not isinstance(questions, dict):
                    raise APIError(400, "questions must be an object")

                row = DB.create_assessment(
                    teacher_id=user["id"],
                    title=title,
                    chapter_title=chapter_title,
                    pattern_notes=pattern_notes,
                    questions=questions,
                )
                return self.send_json(201, {"assessment": serialize_assessment(row, user["role"])})

            if method == "GET" and path == "/api/assessments":
                user, _ = self.require_auth()
                rows = DB.list_assessments_for_user(user)
                assessments = [serialize_assessment(row, user["role"]) for row in rows]
                return self.send_json(200, {"assessments": assessments})

            raise APIError(404, "API route not found")

        except APIError as exc:
            return self.send_json(exc.status, {"error": exc.message})
        except Exception as exc:
            print(f"Internal server error: {exc}")
            return self.send_json(500, {"error": "Internal server error"})

    def require_auth(self):
        auth_header = self.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            raise APIError(401, "Missing or invalid auth token")

        token = auth_header.replace("Bearer ", "", 1).strip()
        if not token:
            raise APIError(401, "Missing or invalid auth token")

        user = DB.user_from_token(token)
        if not user:
            raise APIError(401, "Session expired or invalid token")

        return user, token

    def handle_register(self, payload):
        name = str(payload.get("name", "")).strip()
        email = str(payload.get("email", "")).strip().lower()
        password = str(payload.get("password", ""))
        role = str(payload.get("role", "teacher")).strip().lower()
        institution = str(payload.get("institution", "")).strip()
        track = str(payload.get("track", "")).strip()

        if not name:
            raise APIError(400, "name is required")
        if "@" not in email:
            raise APIError(400, "valid email is required")
        if len(password) < 6:
            raise APIError(400, "password must be at least 6 characters")
        if role not in ("teacher", "student"):
            raise APIError(400, "role must be teacher or student")
        if DB.get_user_by_email(email):
            raise APIError(409, "An account with this email already exists")

        user = DB.create_user(name, email, password, role, institution, track)
        token = DB.issue_token(user["id"])
        return self.send_json(201, {"token": token, "user": to_public_user(user)})

    def handle_login(self, payload):
        email = str(payload.get("email", "")).strip().lower()
        password = str(payload.get("password", ""))

        if not email or not password:
            raise APIError(400, "email and password are required")

        user = DB.verify_user_credentials(email, password)
        if not user:
            raise APIError(401, "Invalid email or password")

        token = DB.issue_token(user["id"])
        return self.send_json(200, {"token": token, "user": to_public_user(user)})

    def read_json_body(self):
        content_length = int(self.headers.get("Content-Length", "0") or "0")
        if content_length <= 0:
            return {}

        raw = self.rfile.read(content_length)
        try:
            payload = json.loads(raw.decode("utf-8"))
            if not isinstance(payload, dict):
                raise APIError(400, "JSON payload must be an object")
            return payload
        except json.JSONDecodeError:
            raise APIError(400, "Invalid JSON body")

    def send_json(self, status_code, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status_code)
        self._set_cors_headers()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _set_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", CORS_ORIGIN)
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")


def run_server():
    server = ThreadingHTTPServer((HOST, PORT), APIHandler)
    print(f"Server running on http://{HOST}:{PORT}")
    print(f"Database path: {DB_PATH}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")
    finally:
        server.server_close()


if __name__ == "__main__":
    run_server()
