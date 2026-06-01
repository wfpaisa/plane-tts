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
        from omnivoice import OmniVoice
        import soundfile as sf
        import torch

        # Carga el modelo OmniVoice en GPU con precisión float16.
        # Se usa from_pretrained() que descarga/cachea el modelo automáticamente.
        # En la primera ejecución tarda más; las siguientes usan el cache local.
        model = OmniVoice.from_pretrained(
            "k2-fsa/OmniVoice",
            device_map="cuda:0",
            dtype=torch.float16,
        )

        # Construye los kwargs de generación según el modo seleccionado.
        # Se usa un diccionario dinámico porque cada modo requiere parámetros
        # diferentes: clone necesita ref_audio/ref_text, design necesita instruct,
        # y auto no necesita parámetros extra.
        gen_kwargs = {
            "text": text,
            "num_step": args.num_step,
            "speed": args.speed,
            "guidance_scale": args.guidance_scale,
        }

        if args.duration > 0:
            gen_kwargs["duration"] = args.duration

        if args.language != "auto":
            gen_kwargs["language"] = args.language

        gen_kwargs["denoise"] = args.denoise
        gen_kwargs["preprocess_prompt"] = args.preprocess_prompt
        gen_kwargs["postprocess_output"] = args.postprocess_output

        if args.mode == "clone":
            gen_kwargs["ref_audio"] = args.ref_audio
            if args.ref_text:
                gen_kwargs["ref_text"] = args.ref_text
        elif args.mode == "design":
            if args.instruct:
                gen_kwargs["instruct"] = args.instruct
        # auto mode: no extra args needed

        # Genera el audio. model.generate() retorna una lista de np.ndarray
        # con shape (T,) a 24 kHz. Se toma el primer elemento [0].
        audio = model.generate(**gen_kwargs)

        # Guarda el audio como WAV a 24kHz y devuelve la ruta por stdout.
        # La extensión de GNOME Shell lee stdout para saber dónde está el archivo.
        sf.write(args.output, audio[0], 24000)
        print(args.output, end="")

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
