#!/usr/bin/env bash
set -euo pipefail

mkdir -p demo-out

VOICEOVER_TXT="${VOICEOVER_TXT:-demo/voiceover-v5.txt}"
VOICEOVER_WAV="${VOICEOVER_WAV:-demo-out/voiceover-v5.wav}"

if command -v edge-tts >/dev/null 2>&1; then
  # Natural-sounding open-source Edge TTS wrapper (Microsoft Edge online voices).
  edge-tts --file "$VOICEOVER_TXT" --write-media "${VOICEOVER_WAV%.wav}.mp3" --voice en-US-GuyNeural
  ffmpeg -y -i "${VOICEOVER_WAV%.wav}.mp3" -ar 48000 -ac 2 "$VOICEOVER_WAV"
  rm -f "${VOICEOVER_WAV%.wav}.mp3"
elif command -v say >/dev/null 2>&1; then
  # macOS: fast and dependency-free.
  say -v Samantha -r 172 -f "$VOICEOVER_TXT" -o "${VOICEOVER_WAV%.wav}.aiff"
  ffmpeg -y -i "${VOICEOVER_WAV%.wav}.aiff" -ar 48000 -ac 2 "$VOICEOVER_WAV"
  rm -f "${VOICEOVER_WAV%.wav}.aiff"
elif command -v espeak-ng >/dev/null 2>&1; then
  # Linux fallback: espeak-ng robotic but reliable.
  espeak-ng -f "$VOICEOVER_TXT" -w "$VOICEOVER_WAV" -s 150 -p 45 -g 10
  ffmpeg -y -i "$VOICEOVER_WAV" -ar 48000 -ac 2 "${VOICEOVER_WAV%.wav}-clean.wav"
  mv "${VOICEOVER_WAV%.wav}-clean.wav" "$VOICEOVER_WAV"
elif command -v flite >/dev/null 2>&1; then
  # Last-resort Linux fallback.
  flite -f "$VOICEOVER_TXT" -o "$VOICEOVER_WAV"
  ffmpeg -y -i "$VOICEOVER_WAV" -ar 48000 -ac 2 "${VOICEOVER_WAV%.wav}-clean.wav"
  mv "${VOICEOVER_WAV%.wav}-clean.wav" "$VOICEOVER_WAV"
else
  echo "No TTS tool found (edge-tts, say, espeak-ng, or flite). Please install one." >&2
  exit 1
fi

echo "Wrote $VOICEOVER_WAV"
