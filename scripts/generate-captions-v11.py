#!/usr/bin/env python3
"""Generate Remotion captions and edit plan from the v11 voiceover script."""
import json
import math
import os
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VOICEOVER_TEXT = ROOT / "demo" / "voiceover-v11.txt"
VOICEOVER_WAV = ROOT / "remotion" / "public" / "voiceover-v11.wav"
CAPTIONS_OUT = ROOT / "remotion" / "src" / "captions-v11.json"
EDIT_PLAN_OUT = ROOT / "remotion" / "edit-plan-v11.json"
TIMESTAMPS = ROOT / "demo-out" / "stage-timestamps-v11.json"

FPS = 30
INTRO_FRAMES = 90
OUTRO_FRAMES = 90


def sec_to_frame(t: float, offset: int = 0) -> int:
    return offset + math.floor(t * FPS)


def audio_duration():
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(VOICEOVER_WAV)],
        capture_output=True, text=True, check=True,
    )
    return float(result.stdout.strip())


def load_script_phrases():
    text = VOICEOVER_TEXT.read_text()
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())
    sentences = [s.strip() for s in sentences if s.strip()]

    phrases = []
    current = []
    cur_words = 0
    for sent in sentences:
        wcount = len(sent.split())
        if cur_words + wcount > 12 and current:
            phrases.append(" ".join(current))
            current = [sent]
            cur_words = wcount
        else:
            current.append(sent)
            cur_words += wcount
    if current:
        phrases.append(" ".join(current))
    return phrases


def align_phrases(phrases, duration):
    word_counts = [len(p.split()) for p in phrases]
    total_words = sum(word_counts)
    captions = []
    cursor = 0.0
    for phrase, wc in zip(phrases, word_counts):
        phrase_dur = (wc / total_words) * duration
        end = min(cursor + phrase_dur, duration)
        captions.append({
            "text": phrase,
            "startFrame": sec_to_frame(cursor, INTRO_FRAMES),
            "endFrame": sec_to_frame(end, INTRO_FRAMES),
        })
        cursor = end
    return captions


def load_beats():
    if not TIMESTAMPS.exists():
        return {}
    data = json.loads(TIMESTAMPS.read_text())
    hero = data.get("loaded")
    if not hero:
        return {}
    return {k: (v - hero) / 1000.0 for k, v in data.items()}


def build_callouts(beats):
    def f(beat_name):
        return sec_to_frame(beats.get(beat_name, 0), INTRO_FRAMES)

    return [
        {
            "stageId": "problem",
            "startFrame": f("loaded"),
            "endFrame": f("loaded") + 18 * FPS,
            "x": 80,
            "y": 260,
            "width": 560,
            "text": "Problem — ungoverned AI pilot spend",
        },
        {
            "stageId": "onboard",
            "startFrame": f("loaded") + 20 * FPS,
            "endFrame": f("loaded") + 48 * FPS,
            "x": 80,
            "y": 260,
            "width": 560,
            "text": "Onboard — NemoClaw + Hermes sandbox",
        },
        {
            "stageId": "evaluate",
            "startFrame": f("loaded") + 50 * FPS,
            "endFrame": f("loaded") + 62 * FPS,
            "x": 80,
            "y": 260,
            "width": 560,
            "text": "Evaluate — Nemotron scores the pilot",
        },
        {
            "stageId": "fund",
            "startFrame": f("loaded") + 65 * FPS,
            "endFrame": f("loaded") + 78 * FPS,
            "x": 80,
            "y": 260,
            "width": 560,
            "text": "Fund — $185K budget · ~$35K cap · Stripe auth",
        },
        {
            "stageId": "govern",
            "startFrame": f("loaded") + 80 * FPS,
            "endFrame": f("loaded") + 92 * FPS,
            "x": 80,
            "y": 260,
            "width": 560,
            "text": "Govern — evidence gates decide continuation",
        },
        {
            "stageId": "measure",
            "startFrame": f("loaded") + 95 * FPS,
            "endFrame": f("loaded") + 112 * FPS,
            "x": 80,
            "y": 260,
            "width": 560,
            "text": "Measure — NemoClaw blocks out-of-policy call",
        },
        {
            "stageId": "decide",
            "startFrame": f("loaded") + 115 * FPS,
            "endFrame": f("loaded") + 128 * FPS,
            "x": 80,
            "y": 260,
            "width": 560,
            "text": "Decide — Continue, reusable playbook saved",
        },
    ]


def main():
    if not VOICEOVER_WAV.exists():
        raise FileNotFoundError(VOICEOVER_WAV)
    if not VOICEOVER_TEXT.exists():
        raise FileNotFoundError(VOICEOVER_TEXT)

    duration = audio_duration()
    phrases = load_script_phrases()
    captions = align_phrases(phrases, duration)

    main_frames = sec_to_frame(duration, 0)
    total_frames = INTRO_FRAMES + main_frames + OUTRO_FRAMES

    beats = load_beats()
    callouts = build_callouts(beats)

    terminal_overlays = [
        {"name": "nemoclaw-onboard", "src": "terminals-v11/nemoclaw-onboard.webm", "startFrame": sec_to_frame(20, 0), "endFrame": sec_to_frame(35, 0), "x": 1120, "y": 540, "width": 760, "height": 480, "label": "nemohermes onboard"},
        {"name": "hermes-dispatch", "src": "terminals-v11/hermes-dispatch.webm", "startFrame": sec_to_frame(37, 0), "endFrame": sec_to_frame(50, 0), "x": 1120, "y": 540, "width": 760, "height": 480, "label": "hermes dispatch"},
        {"name": "stripe-link-spend", "src": "terminals-v11/stripe-link-spend.webm", "startFrame": sec_to_frame(52, 0), "endFrame": sec_to_frame(65, 0), "x": 1120, "y": 540, "width": 760, "height": 480, "label": "link-cli spend-request"},
        {"name": "mpp-payment", "src": "terminals-v11/mpp-payment.webm", "startFrame": sec_to_frame(67, 0), "endFrame": sec_to_frame(78, 0), "x": 1120, "y": 540, "width": 760, "height": 480, "label": "mppx pay 402 API"},
        {"name": "stripe-projects-provision", "src": "terminals-v11/stripe-projects-provision.webm", "startFrame": sec_to_frame(80, 0), "endFrame": sec_to_frame(90, 0), "x": 1120, "y": 540, "width": 760, "height": 480, "label": "stripe projects add neon/postgres"},
        {"name": "blocked-tool-403", "src": "terminals-v11/blocked-tool-403.webm", "startFrame": sec_to_frame(92, 0), "endFrame": sec_to_frame(105, 0), "x": 1120, "y": 540, "width": 760, "height": 480, "label": "NemoClaw 403 block"},
    ]

    edit_plan = {
        "fps": FPS,
        "introFrames": INTRO_FRAMES,
        "mainFrames": main_frames,
        "outroFrames": OUTRO_FRAMES,
        "totalFrames": total_frames,
        "audioDuration": round(duration, 3),
        "callouts": callouts,
        "terminalOverlays": terminal_overlays,
    }

    CAPTIONS_OUT.parent.mkdir(parents=True, exist_ok=True)
    CAPTIONS_OUT.write_text(json.dumps(captions, indent=2))
    EDIT_PLAN_OUT.write_text(json.dumps(edit_plan, indent=2))

    print(f"Wrote {len(captions)} captions to {CAPTIONS_OUT}")
    print(f"Wrote edit plan ({total_frames} frames, {total_frames/FPS:.2f}s) to {EDIT_PLAN_OUT}")


if __name__ == "__main__":
    main()
