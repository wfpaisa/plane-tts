#!/usr/bin/env python3
"""Plane TTS - Generate speech from text using OmniVoice."""

import sys
import argparse
import tempfile
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description="Generate TTS audio with OmniVoice")
    parser.add_argument(
        "--ref-audio",
        type=str,
        required=True,
        help="Path to reference audio file for voice cloning",
    )
    parser.add_argument(
        "--ref-text",
        type=str,
        default="",
        help="Transcription of the reference audio",
    )
    parser.add_argument(
        "--output",
        type=str,
        default="/tmp/plane-tts-output.wav",
        help="Output WAV file path",
    )
    args = parser.parse_args()

    # Read text from stdin
    text = sys.stdin.read().strip()
    if not text:
        print("Error: no text provided on stdin", file=sys.stderr)
        sys.exit(1)

    ref_audio = Path(args.ref_audio)
    if not ref_audio.exists():
        print(f"Error: reference audio not found: {ref_audio}", file=sys.stderr)
        sys.exit(1)

    try:
        from omnivoice import OmniVoice
        import soundfile as sf
        import torch

        model = OmniVoice.from_pretrained(
            "k2-fsa/OmniVoice",
            device_map="cuda:0",
            dtype=torch.float16,
        )

        audio = model.generate(
            text=text,
            ref_audio=str(ref_audio),
            ref_text=args.ref_text,
        )

        sf.write(args.output, audio[0], 24000)
        print(args.output, end="")

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
