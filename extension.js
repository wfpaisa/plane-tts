import GLib from "gi://GLib";
import Gio from "gi://Gio";
import Meta from "gi://Meta";
import Shell from "gi://Shell";
import St from "gi://St";

import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";

const PYTHON_BIN = "/home/felipe/projects/OmniVoice/.venv/bin/python";
const REF_TEXT = "Transcription of the reference audio.";
const OUTPUT_PATH = "/tmp/plane-tts-output.wav";

export default class PlaneTTSExtension extends Extension {
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
    const readItem = new PopupMenu.PopupMenuItem("Leer selección");
    readItem.connect("activate", () => this._onActivate());
    this._indicator.menu.addMenuItem(readItem);

    const stopItem = new PopupMenu.PopupMenuItem("Detener");
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

  disable() {
    this._stopAll();

    Main.wm.removeKeybinding("tts-shortcut");

    this._indicator?.destroy();
    this._indicator = null;
    this._icon = null;
    this._settings = null;
  }

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
          reject(new Error("No text found in selection"));
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

  async _onActivate() {
    // Cancel any ongoing TTS
    this._stopAll();
    this._cancellable = new Gio.Cancellable();

    try {
      this._setStatus("loading");

      // Get selected text
      const text = await this._getSelectedText();
      if (!text) {
        console.warn("[Plane TTS] No text selected");
        this._setStatus("error");
        return;
      }

      console.log(
        `[Plane TTS] Generating speech for: "${text.substring(0, 50)}..."`,
      );

      // Run TTS Python script
      const scriptPath = GLib.build_filenamev([this.path, "tts.py"]);
      const refAudioPath = GLib.build_filenamev([this.path, "ref.wav"]);

      await this._runTTS(text, scriptPath, refAudioPath);

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

  _runTTS(text, scriptPath, refAudioPath) {
    return new Promise((resolve, reject) => {
      try {
        const proc = new Gio.Subprocess({
          argv: [
            PYTHON_BIN,
            scriptPath,
            "--ref-audio",
            refAudioPath,
            "--ref-text",
            REF_TEXT,
            "--output",
            OUTPUT_PATH,
          ],
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
