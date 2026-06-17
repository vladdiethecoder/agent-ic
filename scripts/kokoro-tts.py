#!/usr/bin/env python3
"""Local Kokoro TTS helper for Agent IC v7.

Reads a plain-text narration file, synthesizes speech with the Kokoro ONNX
model, and writes a 24 kHz mono WAV. The caller is expected to resample to
48 kHz stereo with ffmpeg.

Usage:
    source .venv/bin/activate
    python scripts/kokoro-tts.py --input demo/voiceover-v7.txt --output remotion/public/voiceover.wav
"""

import argparse
import os
import sys
import numpy as np
import soundfile as sf

# The installed kokoro-onnx release expects int32 speed for some exports,
# but the Hugging Face timestamped model expects float32. We patch the
# internal audio creation to match the model we ship.
from kokoro_onnx import Kokoro, MAX_PHONEME_LENGTH, SAMPLE_RATE, trim_audio


def _create_audio(self, phonemes, voice, speed):
    if len(phonemes) > MAX_PHONEME_LENGTH:
        phonemes = phonemes[:MAX_PHONEME_LENGTH]
    tokens = np.array(self.tokenizer.tokenize(phonemes), dtype=np.int64)
    voice = voice[len(tokens)]
    tokens = [[0, *tokens, 0]]
    inputs = {
        "input_ids": tokens,
        "style": np.array(voice, dtype=np.float32),
        "speed": np.array([speed], dtype=np.float32),
    }
    audio = self.sess.run(None, inputs)[0]
    # Remove the batch dimension that this export includes.
    audio = np.squeeze(audio, axis=0)
    return audio, SAMPLE_RATE


Kokoro._create_audio = _create_audio


def synthesize(text: str, model_path: str, voices_path: str, voice: str, speed: float = 1.0):
    tts = Kokoro(model_path, voices_path)
    if voice not in tts.voices:
        raise ValueError(f"Voice {voice!r} not found. Available: {', '.join(tts.voices.keys())}")

    # Split into sentences to keep phoneme batches short and natural.
    sentences = [s.strip() for s in text.replace('\n', ' ').split('.') if s.strip()]
    parts = []
    for sentence in sentences:
        sentence += '.'
        audio, _ = tts.create(sentence, voice=voice, speed=speed, lang='en-us', trim=True)
        parts.append(audio)

    if not parts:
        raise ValueError("No sentences found in input text.")

    return np.concatenate(parts)


def main():
    parser = argparse.ArgumentParser(description='Generate Agent IC voiceover with Kokoro')
    parser.add_argument('--input', required=True, help='Path to narration .txt file')
    parser.add_argument('--output', required=True, help='Path to write output WAV')
    parser.add_argument('--model', default=os.environ.get('KOKORO_MODEL', 'models/kokoro/onnx/model.onnx'))
    parser.add_argument('--voices', default=os.environ.get('KOKORO_VOICES', 'models/kokoro/voices-v1.0.bin'))
    parser.add_argument('--voice', default=os.environ.get('KOKORO_VOICE', 'af_bella'))
    parser.add_argument('--speed', type=float, default=float(os.environ.get('KOKORO_SPEED', '1.0')))
    args = parser.parse_args()

    if not os.path.exists(args.model):
        print(f"Kokoro model not found: {args.model}", file=sys.stderr)
        sys.exit(2)
    if not os.path.exists(args.voices):
        print(f"Kokoro voices not found: {args.voices}", file=sys.stderr)
        sys.exit(2)

    with open(args.input, 'r', encoding='utf-8') as f:
        text = f.read()

    audio = synthesize(text, args.model, args.voices, args.voice, args.speed)
    sf.write(args.output, audio, SAMPLE_RATE)
    print(f"Wrote {args.output} ({len(audio)} samples @ {SAMPLE_RATE} Hz)")


if __name__ == '__main__':
    main()
