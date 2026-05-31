#!/usr/bin/env python3
"""Plane TTS - Generate speech from text using OmniVoice."""

import sys
import argparse
import json
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description="Generate TTS audio with OmniVoice")
    parser.add_argument(
        "--mode",
        type=str,
        choices=["clone", "design", "auto"],
        default="clone",
        help="Voice generation mode",
    )
    parser.add_argument(
        "--ref-audio",
        type=str,
        default="",
        help="Path to reference audio file for voice cloning",
    )
    parser.add_argument(
        "--ref-text",
        type=str,
        default="",
        help="Transcription of the reference audio (empty = auto-transcribe)",
    )
    parser.add_argument(
        "--instruct",
        type=str,
        default="",
        help="Voice design instruction text",
    )
    parser.add_argument(
        "--output",
        type=str,
        default="/tmp/plane-tts-output.wav",
        help="Output WAV file path",
    )
    parser.add_argument(
        "--num-step",
        type=int,
        default=32,
        help="Number of diffusion steps",
    )
    parser.add_argument(
        "--speed",
        type=float,
        default=1.0,
        help="Speed factor",
    )
    parser.add_argument(
        "--guidance-scale",
        type=float,
        default=2.0,
        help="Classifier-free guidance scale",
    )
    args = parser.parse_args()

    # Read text from stdin
    text = sys.stdin.read().strip()
    if not text:
        print("Error: no text provided on stdin", file=sys.stderr)
        sys.exit(1)

    # Validate mode-specific args
    if args.mode == "clone" and args.ref_audio:
        ref_audio = Path(args.ref_audio)
        if not ref_audio.exists():
            print(f"Error: reference audio not found: {ref_audio}", file=sys.stderr)
            sys.exit(1)
    elif args.mode == "clone" and not args.ref_audio:
        print("Error: --ref-audio is required for clone mode", file=sys.stderr)
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

        # Build generation kwargs
        gen_kwargs = {
            "text": text,
            "num_step": args.num_step,
            "speed": args.speed,
            "guidance_scale": args.guidance_scale,
        }

        if args.mode == "clone":
            gen_kwargs["ref_audio"] = args.ref_audio
            if args.ref_text:
                gen_kwargs["ref_text"] = args.ref_text
        elif args.mode == "design":
            if args.instruct:
                gen_kwargs["instruct"] = args.instruct
        # auto mode: no extra args needed

        audio = model.generate(**gen_kwargs)

        sf.write(args.output, audio[0], 24000)
        print(args.output, end="")

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
