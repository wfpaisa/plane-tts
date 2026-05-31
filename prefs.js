import Gtk from "gi://Gtk?version=4.0";
import Adw from "gi://Adw";
import Gio from "gi://Gio";

import {
  ExtensionPreferences,
  gettext as _,
} from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

export default class PlaneTTSPreferences extends ExtensionPreferences {
  // Construye la ventana de preferencias con 3 páginas: Voice (modo y config de
  // voz), Parameters (parámetros avanzados de generación) y Shortcut (atajo de
  // teclado). Se usa fillPreferencesWindow() en vez de getPreferencesWidget()
  // porque permite agregar múltiples páginas Adw.PreferencesPage directamente.
  fillPreferencesWindow(window) {
    const settings = this.getSettings();

    // ── Voice Mode Page ──
    const modePage = new Adw.PreferencesPage({
      title: _("Voz"),
      icon_name: "audio-speakers-symbolic",
    });
    window.add(modePage);

    // Mode selection group
    const modeGroup = new Adw.PreferencesGroup({
      title: _("Modo de voz"),
      description: _("Elige cómo se genera la voz"),
    });
    modePage.add(modeGroup);

    const modeRow = new Adw.ComboRow({
      title: _("Modo"),
      subtitle: _(
        "Clonar usa un audio de referencia, Diseñar usa una descripción de texto, Auto deja que el modelo decida",
      ),
      model: Gtk.StringList.new(["clone", "design", "auto"]),
    });

    // Set initial value
    const modes = ["clone", "design", "auto"];
    const currentMode = settings.get_string("voice-mode");
    modeRow.set_selected(Math.max(0, modes.indexOf(currentMode)));

    modeRow.connect("notify::selected", () => {
      const selected = modes[modeRow.get_selected()];
      settings.set_string("voice-mode", selected);
      this._updateVisibility(cloneGroup, designGroup, selected);
    });
    modeGroup.add(modeRow);

    // ── Clone settings group ──
    const cloneGroup = new Adw.PreferencesGroup({
      title: _("Clonación de voz"),
      description: _(
        "Usa un audio de referencia para clonar una voz. Deja el texto de referencia vacío para auto-transcripción (Whisper).",
      ),
    });
    modePage.add(cloneGroup);

    // Ref audio file chooser
    const refAudioRow = new Adw.ActionRow({
      title: _("Audio de referencia"),
      subtitle:
        settings.get_string("ref-audio-path") ||
        _("Ningún archivo seleccionado"),
    });

    const chooseButton = new Gtk.Button({
      label: _("Elegir archivo"),
      valign: Gtk.Align.CENTER,
    });
    chooseButton.connect("clicked", () => {
      const dialog = new Gtk.FileDialog({
        title: _("Seleccionar audio de referencia"),
      });

      const audioFilter = new Gtk.FileFilter();
      audioFilter.set_name(_("Archivos de audio"));
      audioFilter.add_mime_type("audio/wav");
      audioFilter.add_mime_type("audio/x-wav");
      audioFilter.add_mime_type("audio/flac");
      audioFilter.add_mime_type("audio/mpeg");
      audioFilter.add_pattern("*.wav");
      audioFilter.add_pattern("*.flac");
      audioFilter.add_pattern("*.mp3");

      const filters = Gio.ListStore.new(Gtk.FileFilter);
      filters.append(audioFilter);
      dialog.set_filters(filters);

      dialog.open(window, null, (dlg, result) => {
        try {
          const file = dlg.open_finish(result);
          if (file) {
            const path = file.get_path();
            settings.set_string("ref-audio-path", path);
            refAudioRow.set_subtitle(path);
          }
        } catch (e) {
          // User cancelled
        }
      });
    });

    const clearButton = new Gtk.Button({
      icon_name: "edit-clear-symbolic",
      valign: Gtk.Align.CENTER,
      tooltip_text: _("Limpiar"),
    });
    clearButton.connect("clicked", () => {
      settings.set_string("ref-audio-path", "");
      refAudioRow.set_subtitle(_("Ningún archivo seleccionado"));
    });

    refAudioRow.add_suffix(chooseButton);
    refAudioRow.add_suffix(clearButton);
    cloneGroup.add(refAudioRow);

    // Ref text
    const refTextRow = new Adw.EntryRow({
      title: _("Texto de referencia (opcional)"),
      text: settings.get_string("ref-text"),
      show_apply_button: true,
    });
    refTextRow.connect("apply", () => {
      settings.set_string("ref-text", refTextRow.get_text());
    });
    cloneGroup.add(refTextRow);

    // ── Design settings group ──
    const designGroup = new Adw.PreferencesGroup({
      title: _("Diseño de voz"),
      description: _("Describe las características de voz deseadas"),
    });
    modePage.add(designGroup);

    const instructRow = new Adw.EntryRow({
      title: _("Descripción de voz"),
      text: settings.get_string("instruct-text"),
      show_apply_button: true,
    });
    instructRow.connect("apply", () => {
      settings.set_string("instruct-text", instructRow.get_text());
    });
    designGroup.add(instructRow);

    // Set initial visibility
    this._updateVisibility(cloneGroup, designGroup, currentMode);

    // ── Generation Parameters Page ──
    const paramsPage = new Adw.PreferencesPage({
      title: _("Parámetros"),
      icon_name: "preferences-system-symbolic",
    });
    window.add(paramsPage);

    const genGroup = new Adw.PreferencesGroup({
      title: _("Parámetros de generación"),
      description: _("Parámetros avanzados para la generación de audio"),
    });
    paramsPage.add(genGroup);

    // Num steps
    const numStepRow = new Adw.SpinRow({
      title: _("Pasos de difusión"),
      subtitle: _(
        "Mayor = mejor calidad pero más lento (16 para rápido, 32 para calidad)",
      ),
      adjustment: new Gtk.Adjustment({
        lower: 4,
        upper: 128,
        step_increment: 1,
        page_increment: 8,
        value: settings.get_int("num-step"),
      }),
    });
    settings.bind(
      "num-step",
      numStepRow,
      "value",
      Gio.SettingsBindFlags.DEFAULT,
    );
    genGroup.add(numStepRow);

    // Speed
    const speedRow = new Adw.SpinRow({
      title: _("Velocidad"),
      subtitle: _("> 1.0 = habla más rápida, < 1.0 = habla más lenta"),
      digits: 2,
      adjustment: new Gtk.Adjustment({
        lower: 0.1,
        upper: 3.0,
        step_increment: 0.1,
        page_increment: 0.5,
        value: settings.get_double("speed"),
      }),
    });
    settings.bind("speed", speedRow, "value", Gio.SettingsBindFlags.DEFAULT);
    genGroup.add(speedRow);

    // Guidance scale
    const guidanceRow = new Adw.SpinRow({
      title: _("Escala de guía"),
      subtitle: _("Escala de guía libre de clasificador"),
      digits: 1,
      adjustment: new Gtk.Adjustment({
        lower: 0.0,
        upper: 10.0,
        step_increment: 0.5,
        page_increment: 1.0,
        value: settings.get_double("guidance-scale"),
      }),
    });
    settings.bind(
      "guidance-scale",
      guidanceRow,
      "value",
      Gio.SettingsBindFlags.DEFAULT,
    );
    genGroup.add(guidanceRow);

    // ── Shortcut Page ──
    const shortcutPage = new Adw.PreferencesPage({
      title: _("Atajo"),
      icon_name: "preferences-desktop-keyboard-shortcuts-symbolic",
    });
    window.add(shortcutPage);

    const shortcutGroup = new Adw.PreferencesGroup({
      title: _("Atajo de teclado"),
      description: _("Atajo para leer el texto seleccionado en voz alta"),
    });
    shortcutPage.add(shortcutGroup);

    const currentShortcut = settings.get_strv("tts-shortcut");
    const shortcutRow = new Adw.ActionRow({
      title: _("Atajo TTS"),
      subtitle:
        currentShortcut.length > 0 ? currentShortcut[0] : _("No configurado"),
    });
    shortcutGroup.add(shortcutRow);
  }

  // Muestra u oculta los grupos de configuración según el modo seleccionado.
  // En modo "clone" se muestra el selector de audio de referencia y texto;
  // en modo "design" se muestra el campo de instrucción de voz; en modo
  // "auto" se ocultan ambos porque no requiere configuración extra.
  _updateVisibility(cloneGroup, designGroup, mode) {
    cloneGroup.visible = mode === "clone";
    designGroup.visible = mode === "design";
  }
}
