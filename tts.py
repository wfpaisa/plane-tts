#!/usr/bin/env python3
"""Plane TTS - Genera audio hablado a partir de texto usando OmniVoice.

Este script es invocado por la extensión de GNOME Shell como subproceso.
Recibe el texto a sintetizar por stdin y los parámetros de generación como
argumentos CLI. Genera un archivo WAV y devuelve su ruta por stdout.

Se implementó como script separado (no integrado en la extensión) porque:
- OmniVoice requiere Python con PyTorch/CUDA, incompatible con GJS
- Permite usar un virtualenv independiente con todas las dependencias de ML
- Evita bloquear GNOME Shell durante la generación (se ejecuta en un proceso aparte)
"""

import sys
import argparse
import json
from pathlib import Path


# Punto de entrada principal. Parsea los argumentos, lee el texto de stdin,
# carga el modelo OmniVoice y genera el audio. Se diseñó como función única
# porque el script tiene un solo flujo lineal: entrada → modelo → salida.
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
    parser.add_argument(
        "--duration",
        type=float,
        default=0,
        help="Fixed duration in seconds. 0 = use speed instead.",
    )
    parser.add_argument(
        "--language",
        type=str,
        default="auto",
        help="Language code (auto, en, zh, ja, es, etc.)",
    )
    parser.add_argument(
        "--denoise",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Enable/disable denoising",
    )
    parser.add_argument(
        "--preprocess-prompt",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Preprocess reference audio and text",
    )
    parser.add_argument(
        "--postprocess-output",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Remove long silences from output",
    )
    args = parser.parse_args()

    # Lee el texto a sintetizar desde stdin. Se usa stdin en vez de argumento
    # CLI para evitar problemas con caracteres especiales (comillas, saltos de
    # línea) y para soportar textos largos sin límite de longitud de argv.
    text = sys.stdin.read().strip()
    if not text:
        print("Error: no text provided on stdin", file=sys.stderr)
        sys.exit(1)

    # Valida que el audio de referencia exista en modo clone. Es necesario
    # verificar aquí para dar un error claro antes de cargar el modelo (que
    # tarda varios segundos en inicializar).
    if args.mode == "clone" and args.ref_audio:
        ref_audio = Path(args.ref_audio)
        if not ref_audio.exists():
            print(f"Error: reference audio not found: {ref_audio}", file=sys.stderr)
            sys.exit(1)
    elif args.mode == "clone" and not args.ref_audio:
        print("Error: --ref-audio is required for clone mode", file=sys.stderr)
        sys.exit(1)

    try:
        from omnivoice import OmniVoice, OmniVoiceGenerationConfig
        import numpy as np
        import soundfile as sf
        import torch

        model = OmniVoice.from_pretrained(
            "k2-fsa/OmniVoice",
            device_map="cuda:0",
            dtype=torch.float16,
        )

        gen_config = OmniVoiceGenerationConfig(
            num_step=int(args.num_step),
            guidance_scale=float(args.guidance_scale),
            denoise=bool(args.denoise),
            preprocess_prompt=bool(args.preprocess_prompt),
            postprocess_output=bool(args.postprocess_output),
        )

        lang = args.language if args.language != "auto" else None

        gen_kwargs = {
            "text": text,
            "language": lang,
            "generation_config": gen_config,
        }

        if args.speed != 1.0:
            gen_kwargs["speed"] = args.speed
        if args.duration > 0:
            gen_kwargs["duration"] = args.duration

        if args.mode == "clone":
            gen_kwargs["voice_clone_prompt"] = model.create_voice_clone_prompt(
                ref_audio=args.ref_audio,
                ref_text=args.ref_text or None,
            )

        if args.instruct:
            gen_kwargs["instruct"] = args.instruct.strip()

        audio = model.generate(**gen_kwargs)

        waveform = (audio[0] * 32767).astype(np.int16)
        sf.write(args.output, waveform, model.sampling_rate)
        print(args.output, end="")

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
