# Plane TTS — Extensión de GNOME Shell

Extensión de GNOME Shell que lee en voz alta el texto seleccionado en cualquier aplicación usando [OmniVoice](https://github.com/k2-fsa/OmniVoice) para generar audio con clonación de voz, diseño de voz o modo automático.

## Requisitos

- GNOME Shell 49 o 50
- Python 3 con [OmniVoice](https://github.com/k2-fsa/OmniVoice) instalado en un virtualenv
- GPU NVIDIA con CUDA (o Apple Silicon con MPS, o Intel Arc con XPU)
- `paplay` (incluido con PulseAudio/PipeWire)
- `glib-compile-schemas` (paquete `glib2` o `libglib2.0-dev`)
- `xgettext` y `msgfmt` (paquete `gettext`)

## Estructura del proyecto

```
plane-tts/
├── extension.js          # Lógica principal de la extensión
├── prefs.js              # Panel de preferencias (GTK4/Adw)
├── metadata.json         # Metadatos de la extensión
├── stylesheet.css        # Estilos del indicador del panel
├── tts.py                # Script Python que ejecuta OmniVoice
├── install.sh            # Script de instalación
├── schemas/
│   ├── org.gnome.shell.extensions.plane-tts.gschema.xml
│   └── gschemas.compiled         # Generado por glib-compile-schemas
├── po/
│   ├── plane-tts@wfelipe.com.pot # Plantilla de traducciones
│   ├── es.po                     # Traducción español
│   └── en.po                     # Traducción inglés
└── locale/                       # Traducciones compiladas (.mo)
    ├── es/LC_MESSAGES/plane-tts@wfelipe.com.mo
    └── en/LC_MESSAGES/plane-tts@wfelipe.com.mo
```

## Instalación

### 1. Clonar el repositorio

```bash
git clone https://github.com/wfelipe/plane-tts.git
cd plane-tts
```

### 2. Compilar schemas y traducciones

```bash
# Compilar GSettings schemas
glib-compile-schemas schemas/

# Compilar traducciones
mkdir -p locale/es/LC_MESSAGES locale/en/LC_MESSAGES
msgfmt po/es.po -o locale/es/LC_MESSAGES/plane-tts@wfelipe.com.mo
msgfmt po/en.po -o locale/en/LC_MESSAGES/plane-tts@wfelipe.com.mo
```

### 3. Instalar la extensión

```bash
chmod +x install.sh
./install.sh
```

Esto crea un symlink en `~/.local/share/gnome-shell/extensions/plane-tts@wfelipe.com` apuntando al directorio del proyecto. Cualquier cambio en el código se refleja automáticamente (solo hay que reiniciar GNOME Shell).

### 4. Reiniciar GNOME Shell

En **Wayland** (por defecto en GNOME 49+): cierra sesión y vuelve a iniciar sesión.

### 5. Habilitar la extensión

```bash
gnome-extensions enable plane-tts@wfelipe.com
```

### 6. Configurar

```bash
gnome-extensions prefs plane-tts@wfelipe.com
```

Desde las preferencias puedes:

- **Elegir modo de voz**: clonar (con audio de referencia), diseñar (con descripción de texto) o automático
- **Subir audio de referencia** para clonación de voz
- **Ajustar parámetros**: pasos de difusión, velocidad, escala de guía
- **Ver atajo de teclado** (`Super+Shift+T` por defecto)

## Configurar OmniVoice

La extensión espera que OmniVoice esté instalado en un virtualenv. Edita la ruta del Python en `extension.js`:

```javascript
const PYTHON_BIN = "/home/felipe/projects/OmniVoice/.venv/bin/python";
```

Cámbiala a la ruta de tu virtualenv con OmniVoice instalado.

## Uso

1. **Selecciona texto** con el mouse en cualquier aplicación
2. **Presiona `Super+Shift+T`** o haz clic en el ícono del panel → "Leer selección"
3. El ícono del panel cambia de color según el estado:
   - 🟡 Amarillo: generando audio
   - 🟢 Verde: reproduciendo
   - 🔴 Rojo: error (vuelve a normal en 3 segundos)
4. Para detener: clic en el ícono → "Detener"

## Traducciones

### Agregar un nuevo idioma

1. Copia la plantilla POT a un nuevo archivo `.po`:

```bash
cp po/plane-tts@wfelipe.com.pot po/fr.po  # Ejemplo: francés
```

2. Edita `po/fr.po`:
   - Completa los campos del header (`Language: fr`, `Language-Team: French`, etc.)
   - Traduce cada `msgstr` (el `msgid` contiene el texto en español)

3. Compila la traducción:

```bash
mkdir -p locale/fr/LC_MESSAGES
msgfmt po/fr.po -o locale/fr/LC_MESSAGES/plane-tts@wfelipe.com.mo
```

### Regenerar la plantilla POT

Después de agregar o modificar textos con `_()` en el código:

```bash
xgettext --from-code=UTF-8 --output=po/plane-tts@wfelipe.com.pot *.js
```

### Actualizar traducciones existentes

Después de regenerar el POT, actualiza los archivos `.po` existentes:

```bash
msgmerge --update po/es.po po/plane-tts@wfelipe.com.pot
msgmerge --update po/en.po po/plane-tts@wfelipe.com.pot
```

Y luego recompila los `.mo`.

## Depuración

Ver logs de GNOME Shell filtrados por la extensión:

```bash
journalctl -f -o cat /usr/bin/gnome-shell | grep "Plane TTS"
```

Ver todos los logs de GNOME Shell:

```bash
journalctl -f -o cat /usr/bin/gnome-shell
```

## Probar en sesión aislada

Sin afectar tu escritorio actual (requiere `mutter-devkit` en GNOME 49+):

```bash
sudo pacman -S mutter-devkit
dbus-run-session gnome-shell --devkit --wayland
```

Dentro de la sesión nested, abre una terminal y habilita la extensión.

## Desinstalar

```bash
gnome-extensions disable plane-tts@wfelipe.com
rm ~/.local/share/gnome-shell/extensions/plane-tts@wfelipe.com
```

## Comandos

```bash
# Compila schemas de GSettings + traducciones (.po → .mo)
bun run build

# Compila solo los schemas de GSettings
bun run build:schema

# Compila solo las traducciones (.po → .mo)
bun run build:translations

# Regenera el archivo .pot escaneando los _() en el código
bun run create:translations

# Actualiza los .po existentes con strings nuevos del .pot
bun run merge:translations

# Todo junto: regenerar .pot → actualizar .po → compilar .mo
bun run update:translations

# Instala la extensión (symlink + compila schemas)
bun run install:extension

# Habilita la extensión en GNOME Shell
bun run enable

# Deshabilita la extensión
bun run disable

# Abre el panel de preferencias
bun run prefs

# Ver todos los logs de GNOME Shell en tiempo real
bun run logs

# Ver solo los logs de Plane TTS
bun run logs:extension

# Abre una sesión nested de GNOME Shell para pruebas
bun run wayland:session
```

## Licencia

MIT
