import Gdk from "gi://Gdk?version=4.0";
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
      description: _(
        "Select the method used to generate the voice that will read your text",
      ),
    });
    modePage.add(modeGroup);

    const modeRow = new Adw.ComboRow({
      title: _("Mode"),
      subtitle: _(
        "Clone: imitates a voice from an audio sample. Design: creates a voice from a written description. Auto: the system chooses automatically",
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
        "Upload a short audio sample of the voice you want to imitate. Optionally write what is said in the audio, or leave it empty to detect it automatically.",
      ),
    });
    modePage.add(cloneGroup);

    // Ref audio file chooser
    const refAudioRow = new Adw.ActionRow({
      title: _("Reference Audio"),
      subtitle: settings.get_string("ref-audio-path") || _("No file selected"),
      tooltip_text: _(
        "A short audio file (WAV, MP3, FLAC) with the voice you want to clone",
      ),
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
      tooltip_text: _(
        "Write exactly what is said in the reference audio. If left empty, it will be detected automatically",
      ),
    });
    refTextRow.connect("apply", () => {
      settings.set_string("ref-text", refTextRow.get_text());
    });
    cloneGroup.add(refTextRow);

    // ── Design settings group ──
    const designGroup = new Adw.PreferencesGroup({
      title: _("Voice Design"),
      description: _(
        "Create a custom voice by describing how you want it to sound, without needing an audio sample",
      ),
    });
    modePage.add(designGroup);

    const instructRow = new Adw.EntryRow({
      title: _("Voice Description"),
      text: settings.get_string("instruct-text"),
      show_apply_button: true,
      tooltip_text: _(
        "Example: 'female, calm tone, neutral accent' or 'male, deep voice, British accent'",
      ),
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
      description: _(
        "Adjust these values to control the quality and speed of the generated audio",
      ),
    });
    paramsPage.add(genGroup);

    // Num steps
    const numStepRow = new Adw.SpinRow({
      title: _("Quality"),
      subtitle: _(
        "Controls audio quality. 16 = fast but lower quality, 32 = best quality but slower",
      ),
      adjustment: new Gtk.Adjustment({
        lower: 16,
        upper: 32,
        step_increment: 1,
        page_increment: 4,
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
      subtitle: _(
        "How fast the voice speaks. 1.0 = normal, higher = faster, lower = slower",
      ),
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
      subtitle: _(
        "Controls how closely the voice follows instructions. Higher = more precise but less natural",
      ),
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
      title: _("OmniVoice Model"),
      description: _(
        "Location of the Python program that runs the voice model. Replace [USER] in the path with your system username.",
      ),
    });
    paramsPage.add(pythonGroup);

    const pythonBinRow = new Adw.EntryRow({
      title: _("Python Path"),
      text: settings.get_string("python-bin"),
      show_apply_button: true,
      tooltip_text: _(
        "Full path to the Python executable inside the OmniVoice virtual environment",
      ),
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
      description: _(
        "Select any text on screen and press this shortcut to hear it read aloud",
      ),
    });
    shortcutPage.add(shortcutGroup);

    const currentShortcut = settings.get_strv("tts-shortcut");
    const shortcutLabel = new Gtk.ShortcutLabel({
      accelerator: currentShortcut.length > 0 ? currentShortcut[0] : "",
      disabled_text: _("Not configured"),
      valign: Gtk.Align.CENTER,
    });

    const shortcutRow = new Adw.ActionRow({
      title: _("TTS Shortcut"),
      subtitle: _(
        "Press the keyboard icon to change the shortcut, or the clear icon to restore the default",
      ),
    });
    shortcutRow.add_suffix(shortcutLabel);

    const editButton = new Gtk.Button({
      icon_name: "preferences-desktop-keyboard-shortcuts-symbolic",
      valign: Gtk.Align.CENTER,
      tooltip_text: _("Set shortcut"),
    });
    editButton.connect("clicked", () => {
      const dialog = new Adw.MessageDialog({
        heading: _("Set TTS Shortcut"),
        body: _("Press the desired key combination\u2026"),
        transient_for: window,
        modal: true,
      });
      dialog.add_response("cancel", _("Cancel"));

      const keyController = new Gtk.EventControllerKey();
      keyController.connect("key-pressed", (_ctrl, keyval, _keycode, state) => {
        const mask = state & Gtk.accelerator_get_default_mod_mask();

        if (keyval === Gdk.KEY_Escape && mask === 0) {
          dialog.close();
          return true;
        }

        if (!Gtk.accelerator_valid(keyval, mask)) return true;

        const accel = Gtk.accelerator_name(keyval, mask);
        settings.set_strv("tts-shortcut", [accel]);
        shortcutLabel.set_accelerator(accel);
        dialog.close();
        return true;
      });
      dialog.add_controller(keyController);
      dialog.present();
    });
    shortcutRow.add_suffix(editButton);

    const resetButton = new Gtk.Button({
      icon_name: "edit-clear-symbolic",
      valign: Gtk.Align.CENTER,
      tooltip_text: _("Reset to default"),
    });
    resetButton.connect("clicked", () => {
      settings.reset("tts-shortcut");
      const def = settings.get_strv("tts-shortcut");
      shortcutLabel.set_accelerator(def.length > 0 ? def[0] : "");
    });
    shortcutRow.add_suffix(resetButton);

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
