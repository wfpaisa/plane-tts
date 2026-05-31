#!/usr/bin/env bash
# Script de instalación de la extensión Plane TTS para GNOME Shell.
#
# Compila los schemas de GSettings y crea un symlink en el directorio de
# extensiones de GNOME Shell. Se usa un symlink en vez de copiar archivos
# para que los cambios en el código fuente se reflejen automáticamente
# sin tener que reinstalar (solo reiniciar GNOME Shell).
#
# Se sale inmediatamente si algún comando falla (-e), si se usa una variable
# no definida (-u) o si falla un comando en un pipe (-o pipefail).
set -euo pipefail

# UUID de la extensión — debe coincidir con el uuid en metadata.json
# y con el nombre del directorio donde GNOME Shell busca la extensión.
EXT_UUID="plane-tts@wfelipe.com"

# Ruta donde GNOME Shell espera encontrar la extensión instalada.
EXT_DIR="$HOME/.local/share/gnome-shell/extensions/$EXT_UUID"

# Directorio donde está el código fuente (donde vive este script).
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"

# Compila los schemas XML a formato binario (.compiled) que GSettings
# necesita para funcionar. Sin esto, la extensión no puede leer/escribir
# configuraciones como el atajo de teclado o el modo de voz.
echo "==> Compilando GSettings schemas..."
glib-compile-schemas "$SRC_DIR/schemas/"

# Crea el symlink en el directorio de extensiones. Se verifica si ya existe
# un symlink o directorio previo para evitar errores. Se prefiere symlink
# sobre copiar archivos para desarrollo más ágil.
echo "==> Instalando extensión (symlink)..."
mkdir -p "$(dirname "$EXT_DIR")"

if [ -L "$EXT_DIR" ]; then
    # Si ya existe un symlink, lo elimina para recrearlo
    rm "$EXT_DIR"
elif [ -d "$EXT_DIR" ]; then
    # Si existe como directorio real (instalación previa manual), lo elimina
    echo "WARN: $EXT_DIR existe como directorio, eliminando..."
    rm -rf "$EXT_DIR"
fi

ln -sf "$SRC_DIR" "$EXT_DIR"

# Muestra instrucciones post-instalación
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
