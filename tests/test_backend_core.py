import importlib.util
import os
import tempfile
import types
import unittest
import uuid
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SERVER_PATH = PROJECT_ROOT / "backend" / "server.py"


def load_server_module(db_path):
    os.environ["DATABASE_PATH"] = str(db_path)
    module_name = f"server_test_{uuid.uuid4().hex}"
    spec = importlib.util.spec_from_file_location(module_name, SERVER_PATH)
    module = importlib.util.module_from_spec(spec)
    assert isinstance(module, types.ModuleType)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class BackendCoreTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "test.db"
        self.server = load_server_module(self.db_path)
        self.db = self.server.DB

    def tearDown(self):
        try:
            self.db.conn.close()
        except Exception:
            pass
        self.temp_dir.cleanup()

    def test_register_and_login_flow(self):
        email = "newteacher@example.com"
        user = self.db.create_user(
            name="New Teacher",
            email=email,
            password="secret123",
            role="teacher",
            institution="School",
            track="Science",
        )
        self.assertIsNotNone(user)

        verified = self.db.verify_user_credentials(email, "secret123")
        self.assertIsNotNone(verified)
        token = self.db.issue_token(verified["id"])
        from_token = self.db.user_from_token(token)
        self.assertEqual(from_token["id"], verified["id"])

    def test_publish_and_student_visibility(self):
        teacher = self.db.create_user(
            name="Teacher",
            email="teacher1@example.com",
            password="secret123",
            role="teacher",
            institution="School",
            track="Math",
        )
        student = self.db.create_user(
            name="Student",
            email="student1@example.com",
            password="secret123",
            role="student",
            institution="School",
            track="Grade 8",
        )

        paper = self.server.build_paper(
            title="Unit Test",
            chapter_title="Photosynthesis",
            pattern_notes="CBSE style",
            extracted_text="photosynthesis sunlight chlorophyll glucose oxygen leaves",
            counts={"mcq": 2, "veryShort": 1, "short": 1, "long": 1},
            teacher_name="Teacher",
        )

        row = self.db.create_assessment(
            teacher_id=teacher["id"],
            title=paper["title"],
            chapter_title=paper["chapterTitle"],
            pattern_notes=paper["patternNotes"],
            questions=paper["questions"],
        )
        self.assertIsNotNone(row)

        student_feed = self.db.list_assessments_for_user(student)
        self.assertGreaterEqual(len(student_feed), 1)
        serialized_student = self.server.serialize_assessment(student_feed[0], "student")
        self.assertNotIn("answer", serialized_student["questions"]["mcq"][0])

    def test_teacher_summary_and_delete(self):
        teacher = self.db.create_user(
            name="Teacher2",
            email="teacher2@example.com",
            password="secret123",
            role="teacher",
            institution="School",
            track="History",
        )

        questions = {
            "mcq": [{"prompt": "Q1", "options": ["A", "B", "C", "D"], "answer": "A"}],
            "veryShort": [{"prompt": "Q2"}],
            "short": [{"prompt": "Q3"}],
            "long": [{"prompt": "Q4"}],
        }
        assessment = self.db.create_assessment(
            teacher_id=teacher["id"],
            title="History Test",
            chapter_title="Ancient India",
            pattern_notes="",
            questions=questions,
        )

        summary = self.db.teacher_summary(teacher["id"])
        self.assertEqual(summary["publishedAssessments"], 1)
        self.assertEqual(summary["totalQuestions"], 4)
        self.assertEqual(summary["mcqQuestions"], 1)

        deleted = self.db.delete_assessment(assessment["id"], teacher["id"])
        self.assertTrue(deleted)
        summary_after = self.db.teacher_summary(teacher["id"])
        self.assertEqual(summary_after["publishedAssessments"], 0)


if __name__ == "__main__":
    unittest.main()
