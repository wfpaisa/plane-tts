import GLib from "gi://GLib";
import Gio from "gi://Gio";
import Meta from "gi://Meta";
import Shell from "gi://Shell";
import St from "gi://St";

import {
  Extension,
  gettext as _,
} from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";

const PYTHON_BIN = "/home/felipe/projects/OmniVoice/.venv/bin/python";
const OUTPUT_PATH = "/tmp/plane-tts-output.wav";

export default class PlaneTTSExtension extends Extension {
  // Inicializa la extensión: crea el indicador en el panel superior, registra
  // el atajo de teclado y prepara el estado interno. Se llama cuando GNOME Shell
  // habilita la extensión (login, desbloqueo o activación manual).
  enable() {
    this._settings = this.getSettings();
    this._cancellable = null;
    this._ttsProcess = null;
    this._playProcess = null;

    // Panel indicator
    this._indicator = new PanelMenu.Button(0.0, "Plane TTS", false);
    this._indicator.add_style_class_name("plane-tts-indicator");

    this._icon = new St.Icon({
      icon_name: "audio-speakers-symbolic",
      style_class: "system-status-icon",
    });
    this._indicator.add_child(this._icon);

    // Popup menu
    const readItem = new PopupMenu.PopupMenuItem(_("Leer selección"));
    readItem.connect("activate", () => this._onActivate());
    this._indicator.menu.addMenuItem(readItem);

    const stopItem = new PopupMenu.PopupMenuItem(_("Detener"));
    stopItem.connect("activate", () => this._stopAll());
    this._indicator.menu.addMenuItem(stopItem);

    Main.panel.addToStatusArea(this.uuid, this._indicator);

    // Keybinding
    Main.wm.addKeybinding(
      "tts-shortcut",
      this._settings,
      Meta.KeyBindingFlags.NONE,
      Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
      () => this._onActivate(),
    );
  }

  // Deshabilita la extensión: detiene cualquier proceso TTS activo, remueve
  // el atajo de teclado y destruye el indicador del panel. Se llama al bloquear
  // la pantalla, desinstalar o deshabilitar la extensión. Es obligatorio limpiar
  // todo lo creado en enable() para evitar memory leaks y que la extensión
  // pase la revisión de GNOME Extensions.
  disable() {
    this._stopAll();

    Main.wm.removeKeybinding("tts-shortcut");

    this._indicator?.destroy();
    this._indicator = null;
    this._icon = null;
    this._settings = null;
  }

  // Detiene todos los procesos activos (generación TTS y reproducción de audio)
  // y restaura el ícono del panel a su estado normal. Se necesita porque el
  // usuario puede querer cancelar una generación en curso, o porque disable()
  // debe asegurar que no queden procesos huérfanos al deshabilitar la extensión.
  _stopAll() {
    if (this._cancellable) {
      this._cancellable.cancel();
      this._cancellable = null;
    }
    if (this._ttsProcess) {
      this._ttsProcess.force_exit();
      this._ttsProcess = null;
    }
    if (this._playProcess) {
      this._playProcess.force_exit();
      this._playProcess = null;
    }
    this._setStatus("normal");
  }

  // Cambia el estado visual del indicador en el panel (normal, loading, speaking,
  // error). Se implementó para dar feedback visual al usuario sobre qué está
  // haciendo la extensión: amarillo = generando audio, verde = reproduciendo,
  // rojo = error (se auto-restaura a normal después de 3 segundos).
  _setStatus(status) {
    if (!this._indicator) return;

    this._indicator.remove_style_class_name("plane-tts-loading");
    this._indicator.remove_style_class_name("plane-tts-error");
    this._indicator.remove_style_class_name("plane-tts-speaking");

    switch (status) {
      case "loading":
        this._indicator.add_style_class_name("plane-tts-loading");
        this._icon.icon_name = "content-loading-symbolic";
        break;
      case "speaking":
        this._indicator.add_style_class_name("plane-tts-speaking");
        this._icon.icon_name = "audio-volume-high-symbolic";
        break;
      case "error":
        this._indicator.add_style_class_name("plane-tts-error");
        this._icon.icon_name = "dialog-error-symbolic";
        GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 3, () => {
          this._setStatus("normal");
          return GLib.SOURCE_REMOVE;
        });
        break;
      default:
        this._icon.icon_name = "audio-speakers-symbolic";
    }
  }

  // Obtiene el texto actualmente seleccionado (resaltado con el mouse) en
  // cualquier aplicación usando la PRIMARY selection de X11/Wayland. Intenta
  // múltiples tipos MIME en orden de preferencia porque distintas aplicaciones
  // exponen el texto seleccionado en formatos diferentes. Retorna una Promise
  // porque la API de Meta.Selection es asíncrona.
  _getSelectedText() {
    return new Promise((resolve, reject) => {
      const selection = global.display.get_selection();
      const mimeTypes = [
        "text/plain;charset=utf-8",
        "text/plain",
        "UTF8_STRING",
      ];

      const outputStream = Gio.MemoryOutputStream.new_resizable();

      // Try each mime type in order
      const tryMimeType = (index) => {
        if (index >= mimeTypes.length) {
          reject(new Error(_("No se encontró texto en la selección")));
          return;
        }

        selection.transfer_async(
          Meta.SelectionType.SELECTION_PRIMARY,
          mimeTypes[index],
          -1,
          outputStream,
          null,
          (source, result) => {
            try {
              selection.transfer_finish(result);
              outputStream.close(null);
              const bytes = outputStream.steal_as_bytes();
              const data = bytes.get_data();
              if (data && data.length > 0) {
                const text = new TextDecoder().decode(data);
                resolve(text.trim());
              } else {
                // Try next mime type with a new stream
                const newStream = Gio.MemoryOutputStream.new_resizable();
                tryMimeType.call(this, index + 1, newStream);
              }
            } catch (e) {
              // Try next mime type
              try {
                const newStream = Gio.MemoryOutputStream.new_resizable();
                tryMimeType.call(this, index + 1, newStream);
              } catch (e2) {
                reject(e);
              }
            }
          },
        );
      };

      tryMimeType(0);
    });
  }

  // Método principal que orquesta todo el flujo TTS: obtener texto seleccionado
  // → ejecutar el script Python de OmniVoice → reproducir el audio generado.
  // Se activa al presionar el atajo de teclado o al hacer clic en "Leer selección"
  // del menú. Cancela cualquier TTS previo en curso antes de iniciar uno nuevo.
  async _onActivate() {
    this._stopAll();
    this._cancellable = new Gio.Cancellable();

    try {
      this._setStatus("loading");

      // Get selected text
      const text = await this._getSelectedText();
      if (!text) {
        console.warn(_("[Plane TTS] No hay texto seleccionado"));
        this._setStatus("error");
        return;
      }

      console.log(
        `[Plane TTS] Generating speech for: "${text.substring(0, 50)}..."`,
      );

      // Run TTS Python script
      const scriptPath = GLib.build_filenamev([this.path, "tts.py"]);

      await this._runTTS(text, scriptPath);

      if (this._cancellable?.is_cancelled()) return;

      // Play generated audio
      this._setStatus("speaking");
      await this._playAudio(OUTPUT_PATH);

      this._setStatus("normal");

      // Cleanup temp file
      try {
        const file = Gio.File.new_for_path(OUTPUT_PATH);
        file.delete(null);
      } catch (e) {
        // ignore cleanup errors
      }
    } catch (e) {
      if (!this._cancellable?.is_cancelled()) {
        console.error(`[Plane TTS] Error: ${e.message}`);
        this._setStatus("error");
      }
    }
  }

  // Construye los argumentos de línea de comandos para el script tts.py según
  // el modo de voz seleccionado (clone/design/auto) y los parámetros de
  // generación configurados en las preferencias. Se separó en su propio método
  // para mantener _runTTS() limpio y facilitar la lectura del código.
  _buildTTSArgs(scriptPath) {
    const mode = this._settings.get_string("voice-mode");
    const numStep = this._settings.get_int("num-step");
    const speed = this._settings.get_double("speed");
    const guidanceScale = this._settings.get_double("guidance-scale");

    const argv = [
      PYTHON_BIN,
      scriptPath,
      "--mode",
      mode,
      "--output",
      OUTPUT_PATH,
      "--num-step",
      numStep.toString(),
      "--speed",
      speed.toString(),
      "--guidance-scale",
      guidanceScale.toString(),
    ];

    if (mode === "clone") {
      const refAudio = this._settings.get_string("ref-audio-path");
      const refText = this._settings.get_string("ref-text");
      if (refAudio) argv.push("--ref-audio", refAudio);
      if (refText) argv.push("--ref-text", refText);
    } else if (mode === "design") {
      const instruct = this._settings.get_string("instruct-text");
      if (instruct) argv.push("--instruct", instruct);
    }

    return argv;
  }

  // Ejecuta el script Python tts.py como subproceso, enviándole el texto a
  // sintetizar por stdin. Usa Gio.Subprocess porque GNOME Shell no permite
  // operaciones bloqueantes (congelaría todo el escritorio). El texto se envía
  // por stdin en vez de argumento CLI para evitar problemas con caracteres
  // especiales y textos largos.
  _runTTS(text, scriptPath) {
    return new Promise((resolve, reject) => {
      try {
        const proc = new Gio.Subprocess({
          argv: this._buildTTSArgs(scriptPath),
          flags:
            Gio.SubprocessFlags.STDIN_PIPE |
            Gio.SubprocessFlags.STDOUT_PIPE |
            Gio.SubprocessFlags.STDERR_PIPE,
        });
        proc.init(this._cancellable);
        this._ttsProcess = proc;

        proc.communicate_utf8_async(
          text,
          this._cancellable,
          (source, result) => {
            try {
              const [ok, stdout, stderr] = proc.communicate_utf8_finish(result);
              this._ttsProcess = null;

              if (proc.get_exit_status() !== 0) {
                reject(new Error(`TTS failed: ${stderr || "unknown error"}`));
                return;
              }

              resolve(stdout?.trim() || OUTPUT_PATH);
            } catch (e) {
              this._ttsProcess = null;
              reject(e);
            }
          },
        );
      } catch (e) {
        reject(e);
      }
    });
  }

  // Reproduce el archivo WAV generado usando paplay (compatible con PulseAudio
  // y PipeWire). Se usa un subproceso externo en lugar de Meta.SoundPlayer
  // porque este último está diseñado para sonidos cortos de notificación y no
  // para audio largo de TTS.
  _playAudio(audioPath) {
    return new Promise((resolve, reject) => {
      try {
        const proc = new Gio.Subprocess({
          argv: ["paplay", audioPath],
          flags: Gio.SubprocessFlags.NONE,
        });
        proc.init(this._cancellable);
        this._playProcess = proc;

        proc.wait_async(this._cancellable, (source, result) => {
          try {
            proc.wait_finish(result);
            this._playProcess = null;

            if (proc.get_exit_status() !== 0) {
              reject(new Error("Audio playback failed"));
              return;
            }
            resolve();
          } catch (e) {
            this._playProcess = null;
            reject(e);
          }
        });
      } catch (e) {
        reject(e);
      }
    });
  }
}
