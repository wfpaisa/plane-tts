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
      title: _("Voice"),
      icon_name: "audio-speakers-symbolic",
    });
    window.add(modePage);

    // Mode selection group
    const modeGroup = new Adw.PreferencesGroup({
      title: _("Voice Mode"),
      description: _("Choose how the voice is generated"),
    });
    modePage.add(modeGroup);

    const modeRow = new Adw.ComboRow({
      title: _("Mode"),
      subtitle: _(
        "Clone uses a reference audio, Design uses a text description, Auto lets the model decide",
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
      title: _("Voice Cloning"),
      description: _(
        "Use a reference audio to clone a voice. Leave the reference text empty for auto-transcription (Whisper).",
      ),
    });
    modePage.add(cloneGroup);

    // Ref audio file chooser
    const refAudioRow = new Adw.ActionRow({
      title: _("Reference Audio"),
      subtitle: settings.get_string("ref-audio-path") || _("No file selected"),
    });

    const chooseButton = new Gtk.Button({
      label: _("Choose File"),
      valign: Gtk.Align.CENTER,
    });
    chooseButton.connect("clicked", () => {
      const dialog = new Gtk.FileDialog({
        title: _("Select Reference Audio"),
      });

      const audioFilter = new Gtk.FileFilter();
      audioFilter.set_name(_("Audio Files"));
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
      tooltip_text: _("Clear"),
    });
    clearButton.connect("clicked", () => {
      settings.set_string("ref-audio-path", "");
      refAudioRow.set_subtitle(_("No file selected"));
    });

    refAudioRow.add_suffix(chooseButton);
    refAudioRow.add_suffix(clearButton);
    cloneGroup.add(refAudioRow);

    // Ref text
    const refTextRow = new Adw.EntryRow({
      title: _("Reference Text (optional)"),
      text: settings.get_string("ref-text"),
      show_apply_button: true,
    });
    refTextRow.connect("apply", () => {
      settings.set_string("ref-text", refTextRow.get_text());
    });
    cloneGroup.add(refTextRow);

    // ── Design settings group ──
    const designGroup = new Adw.PreferencesGroup({
      title: _("Voice Design"),
      description: _("Describe the desired voice characteristics"),
    });
    modePage.add(designGroup);

    const instructRow = new Adw.EntryRow({
      title: _("Voice Description"),
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
      title: _("Parameters"),
      icon_name: "preferences-system-symbolic",
    });
    window.add(paramsPage);

    const genGroup = new Adw.PreferencesGroup({
      title: _("Generation Parameters"),
      description: _("Advanced parameters for audio generation"),
    });
    paramsPage.add(genGroup);

    // Num steps
    const numStepRow = new Adw.SpinRow({
      title: _("Diffusion Steps"),
      subtitle: _(
        "Higher = better quality but slower (16 for fast, 32 for quality)",
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
      title: _("Speed"),
      subtitle: _("> 1.0 = faster speech, < 1.0 = slower speech"),
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
      title: _("Guidance Scale"),
      subtitle: _("Classifier-free guidance scale"),
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

    // Python binary path
    const pythonGroup = new Adw.PreferencesGroup({
      title: _("Python"),
      description: _(
        "Path to the Python binary with OmniVoice installed (virtualenv). Replace [USER] with your username.",
      ),
    });
    paramsPage.add(pythonGroup);

    const pythonBinRow = new Adw.EntryRow({
      title: _("Python Path"),
      text: settings.get_string("python-bin"),
      show_apply_button: true,
    });
    pythonBinRow.connect("apply", () => {
      settings.set_string("python-bin", pythonBinRow.get_text());
    });
    pythonGroup.add(pythonBinRow);

    // ── Shortcut Page ──
    const shortcutPage = new Adw.PreferencesPage({
      title: _("Shortcut"),
      icon_name: "preferences-desktop-keyboard-shortcuts-symbolic",
    });
    window.add(shortcutPage);

    const shortcutGroup = new Adw.PreferencesGroup({
      title: _("Keyboard Shortcut"),
      description: _("Shortcut to read the selected text aloud"),
    });
    shortcutPage.add(shortcutGroup);

    const currentShortcut = settings.get_strv("tts-shortcut");
    const shortcutRow = new Adw.ActionRow({
      title: _("TTS Shortcut"),
      subtitle:
        currentShortcut.length > 0 ? currentShortcut[0] : _("Not configured"),
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
