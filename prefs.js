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
      this._updateVisibility(cloneGroup, designGroup, tipsGroup, selected);
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
        "Transcript of the reference audio. Leave empty to auto-transcribe via ASR models.",
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
        "Build a voice description by selecting attributes below. The preview shows what will be sent to the model.",
      ),
    });
    modePage.add(designGroup);

    // Freeform toggle
    const freeformRow = new Adw.SwitchRow({
      title: _("Freeform mode"),
      subtitle: _(
        "Enable to type your own description instead of using selectors",
      ),
    });
    designGroup.add(freeformRow);

    // Freeform entry (hidden by default)
    const freeformEntry = new Adw.EntryRow({
      title: _("Custom description"),
      text: settings.get_string("instruct-text"),
      show_apply_button: true,
      visible: false,
    });
    freeformEntry.connect("apply", () => {
      settings.set_string("instruct-text", freeformEntry.get_text());
    });
    designGroup.add(freeformEntry);

    // Selector data
    const genderOpts = ["auto", "male", "female"];
    const ageOpts = [
      "auto",
      "child",
      "teenager",
      "young adult",
      "middle-aged",
      "elderly",
    ];
    const pitchOpts = [
      "auto",
      "very low pitch",
      "low pitch",
      "moderate pitch",
      "high pitch",
      "very high pitch",
    ];
    const styleOpts = ["auto", "whisper"];
    const accentOpts = [
      "auto",
      "american accent",
      "british accent",
      "australian accent",
      "canadian accent",
      "indian accent",
      "chinese accent",
      "korean accent",
      "japanese accent",
      "portuguese accent",
      "russian accent",
    ];

    // Preview row
    const previewRow = new Adw.ActionRow({
      title: _("Preview"),
      subtitle: "",
      css_classes: ["property"],
    });

    const buildPreview = () => {
      const parts = [];
      const g = genderOpts[genderRow.get_selected()];
      const a = ageOpts[ageRow.get_selected()];
      const p = pitchOpts[pitchRow.get_selected()];
      const s = styleOpts[styleRow.get_selected()];
      const ac = accentOpts[accentRow.get_selected()];
      if (g !== "auto") parts.push(g);
      if (a !== "auto") parts.push(a);
      if (p !== "auto") parts.push(p);
      if (s !== "auto") parts.push(s);
      if (ac !== "auto") parts.push(ac);
      const result = parts.join(", ").toLowerCase();
      previewRow.set_subtitle(
        result || _("(empty — model will choose defaults)"),
      );
      settings.set_string("instruct-text", result);
    };

    // Parse current instruct-text to set initial selector values
    const parseInitial = (opts, current) => {
      const lower = current.toLowerCase();
      for (let i = 1; i < opts.length; i++) {
        if (lower.includes(opts[i])) return i;
      }
      return 0;
    };
    const currentInstruct = settings.get_string("instruct-text");

    // Gender
    const genderRow = new Adw.ComboRow({
      title: _("Gender"),
      model: Gtk.StringList.new(
        genderOpts.map((o) => (o === "auto" ? _("Auto") : o)),
      ),
    });
    genderRow.set_selected(parseInitial(genderOpts, currentInstruct));
    genderRow.connect("notify::selected", buildPreview);
    designGroup.add(genderRow);

    // Age
    const ageRow = new Adw.ComboRow({
      title: _("Age"),
      model: Gtk.StringList.new(
        ageOpts.map((o) => (o === "auto" ? _("Auto") : o)),
      ),
    });
    ageRow.set_selected(parseInitial(ageOpts, currentInstruct));
    ageRow.connect("notify::selected", buildPreview);
    designGroup.add(ageRow);

    // Pitch
    const pitchRow = new Adw.ComboRow({
      title: _("Pitch"),
      model: Gtk.StringList.new(
        pitchOpts.map((o) => (o === "auto" ? _("Auto") : o)),
      ),
    });
    pitchRow.set_selected(parseInitial(pitchOpts, currentInstruct));
    pitchRow.connect("notify::selected", buildPreview);
    designGroup.add(pitchRow);

    // Style
    const styleRow = new Adw.ComboRow({
      title: _("Style"),
      model: Gtk.StringList.new(
        styleOpts.map((o) => (o === "auto" ? _("Auto") : o)),
      ),
    });
    styleRow.set_selected(parseInitial(styleOpts, currentInstruct));
    styleRow.connect("notify::selected", buildPreview);
    designGroup.add(styleRow);

    // English Accent
    const accentRow = new Adw.ComboRow({
      title: _("English Accent"),
      model: Gtk.StringList.new(
        accentOpts.map((o) => (o === "auto" ? _("Auto") : o)),
      ),
    });
    accentRow.set_selected(parseInitial(accentOpts, currentInstruct));
    accentRow.connect("notify::selected", buildPreview);
    designGroup.add(accentRow);

    designGroup.add(previewRow);

    // Selector widgets list for toggling visibility
    const selectorRows = [
      genderRow,
      ageRow,
      pitchRow,
      styleRow,
      accentRow,
      previewRow,
    ];

    // Freeform toggle logic
    freeformRow.connect("notify::active", () => {
      const free = freeformRow.get_active();
      freeformEntry.visible = free;
      selectorRows.forEach((r) => (r.visible = !free));
      if (!free) buildPreview();
    });

    // Tips
    const tipsGroup = new Adw.PreferencesGroup({
      title: _("Tips"),
      description: _(
        "Combine freely across categories. Leave attributes as Auto to let the model decide. English accents only apply to English speech.",
      ),
    });
    modePage.add(tipsGroup);

    // Build initial preview
    buildPreview();

    // ── Language group (visible in all modes) ──
    const langGroup = new Adw.PreferencesGroup({
      title: _("Language"),
    });
    modePage.add(langGroup);

    const languages = [
      "auto",
      "en",
      "zh",
      "ja",
      "es",
      "fr",
      "de",
      "ru",
      "pt",
      "yue",
      "th",
      "it",
      "ko",
      "vi",
      "id",
      "no",
      "ca",
      "hr",
      "lt",
      "sk",
      "sv",
    ];
    const langNames = [
      _("Auto"),
      _("English (en)"),
      _("Chinese (zh)"),
      _("Japanese (ja)"),
      _("Spanish (es)"),
      _("French (fr)"),
      _("German (de)"),
      _("Russian (ru)"),
      _("Portuguese (pt)"),
      _("Cantonese (yue)"),
      _("Thai (th)"),
      _("Italian (it)"),
      _("Korean (ko)"),
      _("Vietnamese (vi)"),
      _("Indonesian (id)"),
      _("Norwegian (no)"),
      _("Catalan (ca)"),
      _("Croatian (hr)"),
      _("Lithuanian (lt)"),
      _("Slovak (sk)"),
      _("Swedish (sv)"),
    ];
    const langRow = new Adw.ComboRow({
      title: _("Language"),
      subtitle: _("Keep as Auto to auto-detect the language"),
      model: Gtk.StringList.new(langNames),
    });
    const currentLang = settings.get_string("language");
    langRow.set_selected(Math.max(0, languages.indexOf(currentLang)));
    langRow.connect("notify::selected", () => {
      settings.set_string("language", languages[langRow.get_selected()]);
    });
    langGroup.add(langRow);

    // Set initial visibility
    this._updateVisibility(cloneGroup, designGroup, tipsGroup, currentMode);

    // ── Generation Parameters Page ──
    const paramsPage = new Adw.PreferencesPage({
      title: _("Parameters"),
      icon_name: "preferences-system-symbolic",
    });
    window.add(paramsPage);

    // ── Reset group (top) ──
    const resetGroup = new Adw.PreferencesGroup();
    paramsPage.add(resetGroup);

    const resetRow = new Adw.ActionRow({
      title: _("Reset All Settings"),
      subtitle: _("Restore all parameters to their default values"),
    });
    const resetAllButton = new Gtk.Button({
      label: _("Reset"),
      valign: Gtk.Align.CENTER,
      css_classes: ["destructive-action"],
    });
    resetAllButton.connect("clicked", () => {
      const keys = [
        "voice-mode",
        "ref-audio-path",
        "ref-text",
        "instruct-text",
        "language",
        "num-step",
        "speed",
        "duration",
        "guidance-scale",
        "denoise",
        "preprocess-prompt",
        "postprocess-output",
        "tts-shortcut",
      ];
      keys.forEach((k) => settings.reset(k));

      // Refresh UI widgets that are not bound via settings.bind
      modeRow.set_selected(0);
      langRow.set_selected(0);
      refAudioRow.set_subtitle(_("No file selected"));
      refTextRow.set_text("");
      durationRow.set_text("0");
      freeformRow.set_active(false);
      freeformEntry.set_text("");
      [genderRow, ageRow, pitchRow, styleRow, accentRow].forEach((r) =>
        r.set_selected(0),
      );
      buildPreview();
      const def = settings.get_strv("tts-shortcut");
      shortcutLabel.set_accelerator(def.length > 0 ? def[0] : "");
    });
    resetRow.add_suffix(resetAllButton);
    resetGroup.add(resetRow);

    const genGroup = new Adw.PreferencesGroup({
      title: _("Generation Parameters"),
      description: _(
        "Adjust these values to control the quality and speed of the generated audio",
      ),
    });
    paramsPage.add(genGroup);

    // Speed (range 0.5 - 1.5)
    const speedRow = new Adw.SpinRow({
      title: _("Speed"),
      subtitle: _(
        "1.0 = normal. >1 faster, <1 slower. Ignored if Duration is set.",
      ),
      digits: 2,
      adjustment: new Gtk.Adjustment({
        lower: 0.5,
        upper: 1.5,
        step_increment: 0.05,
        page_increment: 0.1,
        value: settings.get_double("speed"),
      }),
    });
    settings.bind("speed", speedRow, "value", Gio.SettingsBindFlags.DEFAULT);
    genGroup.add(speedRow);

    // Duration (input, default 0)
    const durationRow = new Adw.EntryRow({
      title: _("Duration (seconds)"),
      text: settings.get_double("duration").toString(),
      show_apply_button: true,
      tooltip_text: _(
        "Leave as 0 to use speed. Set a fixed duration in seconds to override speed.",
      ),
    });
    durationRow.connect("apply", () => {
      const val = parseFloat(durationRow.get_text()) || 0;
      settings.set_double("duration", Math.max(0, val));
      durationRow.set_text(Math.max(0, val).toString());
    });
    genGroup.add(durationRow);

    // Inference Steps (range 4 - 64)
    const numStepRow = new Adw.SpinRow({
      title: _("Inference Steps"),
      subtitle: _("Default: 32. Lower = faster, higher = better quality."),
      adjustment: new Gtk.Adjustment({
        lower: 4,
        upper: 64,
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

    // Guidance Scale (range 0 - 4)
    const guidanceRow = new Adw.SpinRow({
      title: _("Guidance Scale (CFG)"),
      subtitle: _("Default: 2.0."),
      digits: 1,
      adjustment: new Gtk.Adjustment({
        lower: 0.0,
        upper: 4.0,
        step_increment: 0.1,
        page_increment: 0.5,
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

    // ── Processing group ──
    const procGroup = new Adw.PreferencesGroup({
      title: _("Processing"),
    });
    paramsPage.add(procGroup);

    // Denoise (checkbox)
    const denoiseRow = new Adw.SwitchRow({
      title: _("Denoise"),
      subtitle: _("Remove noise from generated audio. Disable for raw output."),
    });
    settings.bind(
      "denoise",
      denoiseRow,
      "active",
      Gio.SettingsBindFlags.DEFAULT,
    );
    procGroup.add(denoiseRow);

    // Preprocess Prompt (checkbox)
    const preprocessRow = new Adw.SwitchRow({
      title: _("Preprocess Prompt"),
      subtitle: _(
        "Apply silence removal and trimming to reference audio, add punctuation to reference text.",
      ),
    });
    settings.bind(
      "preprocess-prompt",
      preprocessRow,
      "active",
      Gio.SettingsBindFlags.DEFAULT,
    );
    procGroup.add(preprocessRow);

    // Postprocess Output (checkbox)
    const postprocessRow = new Adw.SwitchRow({
      title: _("Postprocess Output"),
      subtitle: _("Remove long silences from generated audio."),
    });
    settings.bind(
      "postprocess-output",
      postprocessRow,
      "active",
      Gio.SettingsBindFlags.DEFAULT,
    );
    procGroup.add(postprocessRow);

    // ── Model Page ──
    const modelPage = new Adw.PreferencesPage({
      title: _("Model"),
      icon_name: "application-x-executable-symbolic",
    });
    window.add(modelPage);

    const pythonGroup = new Adw.PreferencesGroup({
      title: _("OmniVoice Model"),
      description: _(
        "Location of the Python program that runs the voice model. Replace [USER] in the path with your system username.",
      ),
    });
    modelPage.add(pythonGroup);

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

    const installGroup = new Adw.PreferencesGroup({
      title: _("Installation"),
      description: _("To install OmniVoice, run these commands in a terminal:"),
    });
    modelPage.add(installGroup);

    const installRow = new Adw.EntryRow({
      title: _("Commands"),
      text: "git clone https://github.com/k2-fsa/OmniVoice.git && cd OmniVoice && uv sync && uv pip install -e .",
      editable: false,
    });
    installGroup.add(installRow);

    const docsGroup = new Adw.PreferencesGroup({
      title: _("Documentation"),
    });
    modelPage.add(docsGroup);

    const docsRow = new Adw.EntryRow({
      title: _("Repository"),
      text: "https://github.com/k2-fsa/OmniVoice/",
      editable: false,
    });
    docsGroup.add(docsRow);

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
  _updateVisibility(cloneGroup, designGroup, tipsGroup, mode) {
    cloneGroup.visible = mode === "clone";
    const showDesign = mode === "design" || mode === "auto";
    designGroup.visible = showDesign;
    tipsGroup.visible = showDesign;
  }
}
