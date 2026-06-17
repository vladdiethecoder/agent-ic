#!/usr/bin/env python3
"""Generate Remotion captions and edit plan for the v12 video pipeline.

Uses word-level timestamps from scripts/align-voiceover-v12.py,
strips storyboard metadata, groups words into safe lower-third phrases,
and emits:
    remotion/src/captions-v12.json
    remotion/edit-plan-v12.json

Usage:
    .venv-v12-align/bin/python scripts/align-voiceover-v12.py
    .venv-v12-align/bin/python scripts/generate-captions-v12.py
"""
import json
import math
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VOICEOVER_TEXT = ROOT / "demo" / "voiceover-v11.txt"
VOICEOVER_WAV = ROOT / "remotion" / "public" / "voiceover-v11.wav"
ALIGNED_WORDS = ROOT / "demo-out" / "aligned-words-v12.json"
CAPTIONS_OUT = ROOT / "remotion" / "src" / "captions-v12.json"
EDIT_PLAN_OUT = ROOT / "remotion" / "edit-plan-v12.json"

FPS = 30
INTRO_FRAMES = 90
OUTRO_FRAMES = 90

# Safe lower-third caption band: left-aligned, small text, clear of UI/terminal overlays.
CAPTION_REGION = {"x": 80, "y": 920, "width": 1200, "height": 100}

STAGE_TIMINGS = [
    ("Problem", 0, 20),
    ("Onboard", 20, 50),
    ("Evaluate", 50, 65),
    ("Fund", 65, 80),
    ("Govern", 80, 115),
    ("Decide", 115, None),  # end derived from audio duration
]


def sec_to_frame(t: float, offset: int = 0) -> int:
    return offset + math.floor(t * FPS)


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
    """Strip storyboard metadata and normalize spelled-out numbers for captions."""
    lines = text.splitlines()
    cleaned = []
    for line in lines:
        line = line.strip()
        if not line:
            continue
        if line.startswith("[") and "]" in line:
            continue
        cleaned.append(line)
    text = " ".join(cleaned)

    # Convert TTS-friendly spelled-out numbers into compact, UI-consistent forms.
    replacements = [
        (r"one-hundred-eighty-five-thousand-dollar", "$185,000"),
        (r"thirty-five-thousand-dollar", "$35,000"),
        (r"thirty-eight-day", "38-day"),
        (r"two-point-three-six-times", "2.36x"),
        (r"four-oh-three", "403"),
        (r"ninety-day", "90-day"),
    ]
    for pattern, repl in replacements:
        text = re.sub(rf"\b{pattern}\b", repl, text)

    return text


MAX_TOKENS = 12
MIN_TOKENS = 4
MAX_CHARS = 42


def _balanced_split(word: str) -> list[str]:
    """Split a long hyphenated word into two roughly-equal parts at a hyphen."""
    if len(word) <= 20 or "-" not in word:
        return [word]
    best_idx = None
    best_score = None
    for m in re.finditer(r"-", word):
        left = word[: m.start()]
        right = word[m.start() + 1 :]
        score = max(len(left), len(right))
        if best_score is None or score < best_score:
            best_score = score
            best_idx = m.start()
    if best_idx is None:
        return [word]
    return [word[:best_idx], word[best_idx + 1 :]]


def _tokenize(clean_text: str) -> list[dict]:
    """Split script into display tokens. Long hyphenated words become two sub-tokens."""
    tokens: list[dict] = []
    for orig_idx, word in enumerate(clean_text.split()):
        if len(word) > 20 and "-" in word:
            parts = _balanced_split(word)
            for sub_idx, part in enumerate(parts):
                tokens.append({
                    "text": part,
                    "orig": orig_idx,
                    "sub": sub_idx,
                    "is_sub": True,
                })
        else:
            tokens.append({"text": word, "orig": orig_idx, "sub": 0, "is_sub": False})
    return tokens


def _join_tokens(tokens: list[dict]) -> str:
    """Reconstruct phrase text, joining sub-tokens with hyphens and others with spaces."""
    parts: list[str] = []
    for i, tok in enumerate(tokens):
        if i > 0 and tok["orig"] == tokens[i - 1]["orig"]:
            parts.append("-")
        elif i > 0:
            parts.append(" ")
        parts.append(tok["text"])
    return "".join(parts)


def _orig_word_count(tokens: list[dict]) -> int:
    return len({tok["orig"] for tok in tokens})


def split_into_phrases(clean_text: str) -> list[tuple[str, int]]:
    """Group clean script into caption phrases (text, original_word_count).

    Targets 6-12 tokens, <=42 chars. Long hyphenated words are split into sub-tokens
    for grouping so they do not force 1-word captions. Short tail chunks are merged
    into neighbors when possible.
    """
    tokens = _tokenize(clean_text)
    chunks: list[list[dict]] = []
    i = 0
    n = len(tokens)

    while i < n:
        chunk = [tokens[i]]
        i += 1
        while i < n:
            trial = chunk + [tokens[i]]
            if len(trial) > MAX_TOKENS or len(_join_tokens(trial)) > MAX_CHARS:
                break
            remaining = n - i - 1
            # If absorbing the rest avoids a short final chunk, do it.
            if remaining < MIN_TOKENS and len(trial) + remaining <= MAX_TOKENS:
                rest = tokens[i + 1 :]
                if len(_join_tokens(trial + rest)) <= MAX_CHARS:
                    chunk = trial + rest
                    i = n
                    break
            chunk = trial
            i += 1

        # Rebalance: if this chunk is too short, borrow from the previous chunk.
        if len(chunk) < MIN_TOKENS and chunks:
            prev = chunks[-1]
            while len(chunk) < MIN_TOKENS and len(prev) > MIN_TOKENS:
                moved = prev.pop()
                chunk.insert(0, moved)
                if (
                    len(_join_tokens(prev)) > MAX_CHARS
                    or len(_join_tokens(chunk)) > MAX_CHARS
                    or len(chunk) > MAX_TOKENS
                ):
                    prev.append(moved)
                    chunk.pop(0)
                    break

        chunks.append(chunk)

    # Final pass: merge a trailing short chunk back into the previous one if it fits.
    if len(chunks) >= 2 and len(chunks[-1]) < MIN_TOKENS:
        merged = chunks[-2] + chunks[-1]
        if len(merged) <= MAX_TOKENS and len(_join_tokens(merged)) <= MAX_CHARS:
            chunks[-2] = merged
            chunks.pop()

    return [(_join_tokens(chunk), _orig_word_count(chunk)) for chunk in chunks]


def load_aligned_words() -> dict:
    if not ALIGNED_WORDS.exists():
        sys.stderr.write(f"{ALIGNED_WORDS} missing. Run scripts/align-voiceover-v12.py first.\n")
        raise SystemExit(1)
    return json.loads(ALIGNED_WORDS.read_text())


def build_captions(aligned: dict, phrases: list[tuple[str, int]]) -> list[dict]:
    words = aligned["words"]
    duration = aligned["audioDuration"]
    n_align = len(words)
    phrase_word_counts = [wc for _, wc in phrases]
    total_script_words = sum(phrase_word_counts)

    captions = []
    cursor = 0
    for phrase, wc in phrases:
        start_idx = math.floor(cursor * n_align / total_script_words) if total_script_words else 0
        end_idx = math.floor((cursor + wc) * n_align / total_script_words) if total_script_words else n_align
        start_idx = min(start_idx, n_align - 1) if n_align else 0
        end_idx = max(end_idx, start_idx + 1)
        end_idx = min(end_idx, n_align)

        start_t = words[start_idx]["start"] if n_align else 0.0
        end_t = words[end_idx - 1]["end"] if n_align else duration
        end_t = min(end_t, duration)

        captions.append({
            "text": phrase,
            "startFrame": sec_to_frame(start_t, INTRO_FRAMES),
            "endFrame": sec_to_frame(end_t, INTRO_FRAMES),
        })
        cursor += wc

    return captions


def build_callouts(duration: float) -> list[dict]:
    """Left-side animated callouts synchronized to approved voiceover beats."""
    def f(t: float) -> int:
        return sec_to_frame(t, INTRO_FRAMES)

    return [
        {
            "stageId": "problem",
            "startFrame": f(0),
            "endFrame": f(20),
            "x": 80,
            "y": 260,
            "width": 560,
            "text": "Problem — ungoverned AI pilot spend",
        },
        {
            "stageId": "onboard",
            "startFrame": f(20),
            "endFrame": f(50),
            "x": 80,
            "y": 260,
            "width": 560,
            "text": "Onboard — NemoClaw + Hermes sandbox",
        },
        {
            "stageId": "evaluate",
            "startFrame": f(50),
            "endFrame": f(65),
            "x": 80,
            "y": 260,
            "width": 560,
            "text": "Evaluate — Nemotron scores the pilot",
        },
        {
            "stageId": "fund",
            "startFrame": f(65),
            "endFrame": f(80),
            "x": 80,
            "y": 260,
            "width": 560,
            "text": "Fund — $185K budget · ~$35K cap · Stripe auth",
        },
        {
            "stageId": "govern",
            "startFrame": f(80),
            "endFrame": f(115),
            "x": 80,
            "y": 260,
            "width": 560,
            "text": "Govern — evidence gates decide continuation",
        },
        {
            "stageId": "decide",
            "startFrame": f(115),
            "endFrame": sec_to_frame(duration, INTRO_FRAMES),
            "x": 80,
            "y": 260,
            "width": 560,
            "text": "Decide — Continue, reusable playbook saved",
        },
    ]


def build_stage_labels(duration: float) -> list[dict]:
    """Small upper-left stage badges matching the voiceover beats."""
    labels = []
    for i, (name, start, end) in enumerate(STAGE_TIMINGS):
        end_t = duration if end is None else end
        labels.append({
            "stageId": name.lower(),
            "text": name,
            "startFrame": sec_to_frame(start, INTRO_FRAMES),
            "endFrame": sec_to_frame(end_t, INTRO_FRAMES),
            "x": 80,
            "y": 80,
            "width": 320,
        })
    return labels


def main():
    if not VOICEOVER_WAV.exists():
        raise FileNotFoundError(f"Voiceover audio missing: {VOICEOVER_WAV}\nRun: npm run demo:voice-v11")
    if not VOICEOVER_TEXT.exists():
        raise FileNotFoundError(VOICEOVER_TEXT)

    duration = audio_duration(VOICEOVER_WAV)
    aligned = load_aligned_words()

    clean_text = clean_script(VOICEOVER_TEXT.read_text())
    phrases = split_into_phrases(clean_text)
    captions = build_captions(aligned, phrases)

    main_frames = sec_to_frame(duration, 0)
    total_frames = INTRO_FRAMES + main_frames + OUTRO_FRAMES

    edit_plan = {
        "fps": FPS,
        "introFrames": INTRO_FRAMES,
        "mainFrames": main_frames,
        "outroFrames": OUTRO_FRAMES,
        "totalFrames": total_frames,
        "audioDuration": round(duration, 3),
        "captionRegion": CAPTION_REGION,
        "captions": captions,
        "callouts": build_callouts(duration),
        "stageLabels": build_stage_labels(duration),
        "terminalOverlays": [],  # v12 uses the in-UI terminal drawer, not separate PiPs.
    }

    CAPTIONS_OUT.parent.mkdir(parents=True, exist_ok=True)
    CAPTIONS_OUT.write_text(json.dumps(captions, indent=2))
    EDIT_PLAN_OUT.write_text(json.dumps(edit_plan, indent=2))

    print(f"Script words: {len(clean_text.split())}")
    print(f"Aligned words: {aligned['alignedWordCount']} (fallback={aligned['fallback']})")
    print(f"Caption phrases: {len(captions)}")
    print(f"Audio duration: {duration:.3f}s ({sec_to_frame(duration, INTRO_FRAMES)} caption frames)")
    print(f"Edit plan: {total_frames} frames @ {FPS} fps = {total_frames / FPS:.2f}s")
    print(f"Wrote {CAPTIONS_OUT}")
    print(f"Wrote {EDIT_PLAN_OUT}")


if __name__ == "__main__":
    main()
