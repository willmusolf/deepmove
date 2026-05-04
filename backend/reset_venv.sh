#!/bin/bash
# reset_venv.sh — nuke and rebuild the backend venv from scratch
# Run this whenever the venv gets corrupted (pydantic_core, etc.)
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "==> Removing old venv..."
rm -rf venv

echo "==> Creating fresh venv..."
python3 -m venv venv

echo "==> Installing requirements..."
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

echo ""
echo "==> Verifying pydantic_core..."
python -c "import pydantic_core._pydantic_core; print('pydantic_core OK')"
echo "==> Done. Run: source venv/bin/activate"
