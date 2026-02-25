.PHONY: run test check

run:
	python3 backend/server.py

check:
	python3 -m py_compile backend/server.py
	node --check app.js

test:
	python3 -m unittest discover -s tests -p "test_*.py" -v
