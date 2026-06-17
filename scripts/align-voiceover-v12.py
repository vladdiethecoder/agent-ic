#!/usr/bin/env python3
"""Forced-align the v11 voiceover with WhisperX and emit word-level timestamps.

Usage:
    .venv-v12-align/bin/python scripts/align-voiceover-v12.py

Output:
    demo-out/aligned-words-v12.json

Environment:
    HF_HOME / TORCH_HOME default to project-local .cache to avoid home/tmp quotas.
"""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VOICEOVER_TEXT = ROOT / "demo" / "voiceover-v11.txt"
VOICEOVER_WAV = ROOT / "remotion" / "public" / "voiceover-v11.wav"
ALIGNED_WORDS_OUT = ROOT / "demo-out" / "aligned-words-v12.json"

# Keep model cache inside the project so it survives and respects workspace quotas.
os.environ.setdefault("HF_HOME", str(ROOT / ".cache" / "huggingface"))
os.environ.setdefault("TORCH_HOME", str(ROOT / ".cache" / "torch"))
os.environ.setdefault("TRANSFORMERS_CACHE", str(ROOT / ".cache" / "transformers"))

try:
    import numpy as np
    import torch
    import whisperx
except ImportError as exc:
    sys.stderr.write(
        "ERROR: WhisperX is not available in the active Python interpreter.\n"
        "The project .venv is Python 3.14, which WhisperX/ctranslate2 do not yet support.\n"
        "Create/use the dedicated alignment venv:\n"
        "  python3.11 -m venv .venv-v12-align\n"
        "  .venv-v12-align/bin/pip install --no-cache-dir whisperx\n"
    )
    raise SystemExit(1) from exc


def audio_duration(path: Path) -> float:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    return float(result.stdout.strip())


def clean_script(text: str) -> str:
    """Strip storyboard metadata like [0:00-0:20] Problem and collapse paragraphs."""
    lines = text.splitlines()
    cleaned = []
    for line in lines:
        line = line.strip()
        if not line:
            continue
        # Drop lines that are purely stage-timing metadata.
        if line.startswith("[") and "]" in line:
            continue
        cleaned.append(line)
    return " ".join(cleaned)


def fallback_word_times(script_words: list[str], duration: float) -> list[dict]:
    """Evenly space words if WhisperX alignment is unavailable or invalid."""
    n = len(script_words)
    step = duration / max(n, 1)
    words = []
    for i, w in enumerate(script_words):
        start = i * step
        end = min((i + 1) * step, duration)
        words.append({"word": w, "start": round(start, 3), "end": round(end, 3), "score": None})
    return words


def align():
    if not VOICEOVER_WAV.exists():
        raise FileNotFoundError(f"Voiceover audio missing: {VOICEOVER_WAV}\nRun: npm run demo:voice-v11")
    if not VOICEOVER_TEXT.exists():
        raise FileNotFoundError(VOICEOVER_TEXT)

    duration = audio_duration(VOICEOVER_WAV)
    script_text = clean_script(VOICEOVER_TEXT.read_text())
    script_words = script_text.split()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Aligning {len(script_words)} words over {duration:.3f}s on {device} ...")

    audio = whisperx.load_audio(str(VOICEOVER_WAV))
    model_a, metadata = whisperx.load_align_model(language_code="en", device=device)

    # Feed the known script as one segment covering the full audio.
    segments = [{"text": script_text, "start": 0.0, "end": duration}]
    result = whisperx.align(
        segments,
        model_a,
        metadata,
        audio,
        device,
        return_char_alignments=False,
    )

    word_segments = result.get("word_segments", [])
    # WhisperX returns np.float64; coerce for JSON.
    words = [
        {
            "word": str(w.get("word", "")),
            "start": float(w.get("start", 0.0)),
            "end": float(w.get("end", 0.0)),
            "score": float(w.get("score")) if w.get("score") is not None else None,
        }
        for w in word_segments
    ]

    fallback = False
    if not words:
        sys.stderr.write("WARNING: WhisperX returned no word segments; falling back to proportional spacing.\n")
        words = fallback_word_times(script_words, duration)
        fallback = True
    else:
        last_end = words[-1].get("end", 0.0)
        if abs(last_end - duration) > 0.5:
            sys.stderr.write(
                f"WARNING: aligned end ({last_end:.3f}s) differs from audio duration "
                f"({duration:.3f}s) by >0.5s; falling back to proportional spacing.\n"
            )
            words = fallback_word_times(script_words, duration)
            fallback = True

    ALIGNED_WORDS_OUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "audioDuration": round(duration, 3),
        "scriptWordCount": len(script_words),
        "alignedWordCount": len(words),
        "fallback": fallback,
        "device": device,
        "words": words,
    }
    ALIGNED_WORDS_OUT.write_text(json.dumps(payload, indent=2))
    print(
        f"Wrote {ALIGNED_WORDS_OUT}: {len(words)} words, duration {duration:.3f}s, "
        f"fallback={fallback}"
    )


if __name__ == "__main__":
    align()
