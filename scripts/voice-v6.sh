#!/usr/bin/env bash
set -euo pipefail

mkdir -p remotion/public

if command -v edge-tts >/dev/null 2>&1; then
  edge-tts --file demo/voiceover-v6.txt --write-media remotion/public/voiceover.mp3 --voice en-US-GuyNeural
  ffmpeg -y -i remotion/public/voiceover.mp3 -ar 48000 -ac 2 remotion/public/voiceover.wav
  rm -f remotion/public/voiceover.mp3
else
  echo "edge-tts not found. Install with: pip install edge-tts" >&2
  exit 1
fi

echo "Wrote remotion/public/voiceover.wav"
