# Development Guide

## Project Structure

```
plane-tts/
├── extension.js        # Main extension logic (panel indicator, keybinding, TTS subprocess)
├── prefs.js            # Preferences window (GTK4/Adw, 4 pages)
├── tts.py              # Python script that runs OmniVoice
├── metadata.json       # Extension metadata
├── stylesheet.css      # Panel indicator styles
├── install.sh          # Symlink installer
├── package.json        # Build scripts (bun)
├── schemas/
│   └── org.gnome.shell.extensions.plane-tts.gschema.xml
├── po/
│   ├── plane-tts@wfelipe.com.pot   # Translation template
│   └── es.po                       # Spanish translation
└── locale/
    └── es/LC_MESSAGES/plane-tts@wfelipe.com.mo
```

## Build Requirements

- `glib-compile-schemas` (`glib2` or `libglib2.0-dev`)
- `xgettext` and `msgfmt` (`gettext`)
- `bun` (task runner)

## Build Commands

```bash
bun run build                # Compile schemas + translations
bun run build:schema         # Compile GSettings schemas only
bun run build:translations   # Compile .po → .mo only
bun run update:translations  # Regenerate .pot → merge .po → compile .mo
```

## Install & Run

```bash
bash install.sh                              # Symlink to GNOME extensions dir
gnome-extensions enable plane-tts@wfelipe.com
gnome-extensions prefs plane-tts@wfelipe.com
```

The symlink means code changes apply immediately — just restart GNOME Shell (log out/in on Wayland).

## Debugging

```bash
bun run logs              # All GNOME Shell logs
bun run logs:extension    # Filtered to "Plane TTS"
```

## Isolated Wayland Session

Test without affecting your desktop (requires `mutter-devkit` on GNOME 49+):

```bash
sudo pacman -S mutter-devkit
bun run wayland:session
```

## Translations

Base language is English (`msgid`). Spanish is in `po/es.po`.

### Add a new language

```bash
cp po/plane-tts@wfelipe.com.pot po/fr.po
```

Edit `po/fr.po`: set the header fields (`Language: fr`, etc.) and fill each `msgstr`.

Then add the compile step to `build:translations` in `package.json` and run:

```bash
mkdir -p locale/fr/LC_MESSAGES
msgfmt po/fr.po -o locale/fr/LC_MESSAGES/plane-tts@wfelipe.com.mo
```

### Update translations after code changes

```bash
bun run update:translations
```

This runs `xgettext` → `msgmerge` → `msgfmt` in sequence.

## Uninstall

```bash
gnome-extensions disable plane-tts@wfelipe.com
rm ~/.local/share/gnome-shell/extensions/plane-tts@wfelipe.com
```
