#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f demo-out/agent-ic-ui-v5.webm ]]; then
  echo "demo-out/agent-ic-ui-v5.webm not found. Run npm run demo:record first." >&2
  exit 1
fi

if [[ ! -f demo-out/voiceover-v5.wav ]]; then
  echo "demo-out/voiceover-v5.wav not found. Run npm run demo:voice first." >&2
  exit 1
fi

video_duration=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 demo-out/agent-ic-ui-v5.webm)
audio_duration=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 demo-out/voiceover-v5.wav)
ratio=$(awk "BEGIN { printf \"%.6f\", $audio_duration / $video_duration }")

ffmpeg -y \
  -i demo-out/agent-ic-ui-v5.webm \
  -i demo-out/voiceover-v5.wav \
  -filter_complex "[0:v]setpts=${ratio}*PTS[v];[1:a]anull[a]" \
  -map "[v]" \
  -map "[a]" \
  -c:v libopenh264 \
  -pix_fmt yuv420p \
  -r 30 \
  -c:a aac \
  -b:a 160k \
  -shortest \
  -movflags +faststart \
  demo-out/agent-ic-demo-v5.mp4

echo "Wrote demo-out/agent-ic-demo-v5.mp4"
