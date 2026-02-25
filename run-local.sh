#!/bin/zsh
set -e
cd "$(dirname "$0")"
echo "Starting EduAssess Pro at http://localhost:8000"
python3 backend/server.py
