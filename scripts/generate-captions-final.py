#!/usr/bin/env python3
"""Generate Remotion captions and edit plan from the final voiceover script.

This script uses forced-alignment by sentence: it splits the known script into
short phrases and spaces their start/end times proportionally by word count
across the measured audio duration. This avoids a heavy ML transcription step
while keeping captions closely locked to the narration.
"""
import json
import math
import os
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VOICEOVER_TEXT = ROOT / "demo" / "voiceover-final.txt"
VOICEOVER_WAV = ROOT / "remotion" / "public" / "voiceover-final.wav"
CAPTIONS_OUT = ROOT / "remotion" / "src" / "captions-final.json"
EDIT_PLAN_OUT = ROOT / "remotion" / "edit-plan-final.json"
TIMESTAMPS = ROOT / "demo-out" / "stage-timestamps-final.json"

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
    # Split into sentences, then group short sentences into caption-sized phrases.
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())
    sentences = [s.strip() for s in sentences if s.strip()]

    # Desired phrase length: 6-12 words.
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
    hero = data.get("hero")
    if not hero:
        return {}
    return {k: (v - hero) / 1000.0 for k, v in data.items()}


def build_callouts(beats):
    def f(beat_name):
        return sec_to_frame(beats.get(beat_name, 0), INTRO_FRAMES)

    return [
        {
            "stageId": "hero",
            "startFrame": f("hero"),
            "endFrame": f("workbench") - 15,
            "x": 80,
            "y": 260,
            "width": 560,
            "text": "AI pilots need an investment committee",
        },
        {
            "stageId": "workbench",
            "startFrame": f("workbench"),
            "endFrame": f("evaluate_click") - 15,
            "x": 80,
            "y": 260,
            "width": 560,
            "text": "Hermes: proposal → governed schema",
        },
        {
            "stageId": "evaluation",
            "startFrame": f("evaluate_click"),
            "endFrame": f("budget_visible") - 15,
            "x": 80,
            "y": 260,
            "width": 560,
            "text": "Nemotron-style evaluation: viability, evidence, risk",
        },
        {
            "stageId": "budget",
            "startFrame": f("budget_visible"),
            "endFrame": f("stripe_click") - 15,
            "x": 80,
            "y": 220,
            "width": 560,
            "text": "Continue • $185K budget • ~$35K cap",
        },
        {
            "stageId": "stripe",
            "startFrame": f("stripe_click"),
            "endFrame": f("evidence_start") - 15,
            "x": 80,
            "y": 420,
            "width": 560,
            "text": "Stripe authorization, not a blank check",
        },
        {
            "stageId": "evidence",
            "startFrame": f("evidence_start"),
            "endFrame": f("decision") - 15,
            "x": 80,
            "y": 260,
            "width": 560,
            "text": "Capital continues only with evidence",
        },
        {
            "stageId": "decision",
            "startFrame": f("decision"),
            "endFrame": f("governance") - 15,
            "x": 80,
            "y": 260,
            "width": 560,
            "text": "Week 8: finance-readable Continue decision",
        },
        {
            "stageId": "audit",
            "startFrame": f("audit"),
            "endFrame": f("storyboard") - 15,
            "x": 80,
            "y": 260,
            "width": 560,
            "text": "Audit log = product",
        },
        {
            "stageId": "storyboard",
            "startFrame": f("storyboard"),
            "endFrame": f("final_lockup") + 60,
            "x": 80,
            "y": 260,
            "width": 560,
            "text": "Useful • viable • presentable",
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

    edit_plan = {
        "fps": FPS,
        "introFrames": INTRO_FRAMES,
        "mainFrames": main_frames,
        "outroFrames": OUTRO_FRAMES,
        "totalFrames": total_frames,
        "audioDuration": round(duration, 3),
        "callouts": callouts,
    }

    CAPTIONS_OUT.parent.mkdir(parents=True, exist_ok=True)
    CAPTIONS_OUT.write_text(json.dumps(captions, indent=2))
    EDIT_PLAN_OUT.write_text(json.dumps(edit_plan, indent=2))

    print(f"Wrote {len(captions)} captions to {CAPTIONS_OUT}")
    print(f"Wrote edit plan ({total_frames} frames, {total_frames/FPS:.2f}s) to {EDIT_PLAN_OUT}")


if __name__ == "__main__":
    main()
