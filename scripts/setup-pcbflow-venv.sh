#!/usr/bin/env bash
# Creates .venv-pcbflow and installs pcbflow from GitHub + shapely>=2.0.1 (required by pcbflow).
# Run from repo root: npm run setup:pcbflow
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENV="${ROOT}/.venv-pcbflow"
if [[ ! -d "${VENV}" ]]; then
  python3 -m venv "${VENV}"
fi
"${VENV}/bin/pip" install -U pip wheel
"${VENV}/bin/pip" install "shapely>=2.0.1" "git+https://github.com/michaelgale/pcbflow.git"
echo ""
echo "PCBFlow venv ready: ${VENV}"
echo "The app will use this Python automatically when NODE0_PYTHON is unset and .venv-pcbflow exists."
echo "Or set: export NODE0_PYTHON=${VENV}/bin/python3"
