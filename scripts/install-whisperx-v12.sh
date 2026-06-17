#!/usr/bin/env bash
# Create a dedicated Python 3.11 venv for WhisperX alignment.
# The project .venv is Python 3.14, which ctranslate2 (a WhisperX dependency)
# does not yet support.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$SCRIPT_DIR/.."
VENV="$ROOT/.venv-v12-align"

cd "$ROOT"

if [[ ! -x "$VENV/bin/python" ]]; then
  echo "Creating WhisperX alignment venv at $VENV ..."
  python3.11 -m venv "$VENV"
fi

export TMPDIR="${ROOT}/.cache"
mkdir -p "$TMPDIR"

echo "Installing WhisperX (no cache, project-local TMPDIR to avoid /tmp quota issues) ..."
"$VENV/bin/pip" install -q --upgrade pip
"$VENV/bin/pip" install -q --no-cache-dir whisperx

echo "WhisperX ready: $VENV/bin/python"
"$VENV/bin/python" -c "import whisperx, torch; print('device:', 'cuda' if torch.cuda.is_available() else 'cpu')"
