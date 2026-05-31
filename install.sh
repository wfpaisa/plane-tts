#!/usr/bin/env bash
set -euo pipefail

EXT_UUID="plane-tts@wfelipe.com"
EXT_DIR="$HOME/.local/share/gnome-shell/extensions/$EXT_UUID"
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "==> Compilando GSettings schemas..."
glib-compile-schemas "$SRC_DIR/schemas/"

echo "==> Instalando extensión (symlink)..."
mkdir -p "$(dirname "$EXT_DIR")"

if [ -L "$EXT_DIR" ]; then
    rm "$EXT_DIR"
elif [ -d "$EXT_DIR" ]; then
    echo "WARN: $EXT_DIR existe como directorio, eliminando..."
    rm -rf "$EXT_DIR"
fi

ln -sf "$SRC_DIR" "$EXT_DIR"

echo "==> Extensión instalada en: $EXT_DIR -> $SRC_DIR"
echo ""
echo "Para habilitar:"
echo "  gnome-extensions enable $EXT_UUID"
echo ""
echo "Para probar en sesión nested (Wayland):"
echo "  dbus-run-session gnome-shell --devkit --wayland"
echo ""
echo "Para ver logs:"
echo "  journalctl -f -o cat /usr/bin/gnome-shell"
echo ""
echo "IMPORTANTE: Coloca tu archivo ref.wav en: $SRC_DIR/ref.wav"
