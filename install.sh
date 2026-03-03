#!/bin/bash
# Install en-parlant locally
# Usage: sudo ./install.sh
#
# Binary goes to /usr/bin/
# Resources (docs, sound) go to /usr/lib/en-parlant/
# (Tauri resolveResource looks in /usr/lib/<productName>/ on Linux)

set -e

RELEASE_DIR="src-tauri/target/release"
RES_DIR="/usr/lib/en-parlant"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run with sudo: sudo ./install.sh"
  exit 1
fi

if [ ! -f "$RELEASE_DIR/en-parlant" ]; then
  echo "Binary not found. Run 'pnpm tauri build --no-bundle' first."
  exit 1
fi

# Clean previous install (both old and new names)
rm -f /usr/bin/en-croissant-TTS
rm -f /usr/bin/en-parlant
rm -rf /usr/lib/en-croissant-TTS
rm -rf "$RES_DIR"
rm -rf /opt/en-croissant-TTS

# Binary
cp "$RELEASE_DIR/en-parlant" /usr/bin/en-parlant
chmod 755 /usr/bin/en-parlant

# Resources (copy from source — --no-bundle doesn't copy resources to release dir)
mkdir -p "$RES_DIR"
cp -r docs/  "$RES_DIR/docs"
cp -r sound/ "$RES_DIR/sound"
cp -r scripts/ "$RES_DIR/scripts"

# Set up KittenTTS venv if it exists in source
if [ -d "scripts/.venv" ]; then
  cp -r scripts/.venv "$RES_DIR/scripts/.venv"
fi

# Copy bundled KittenTTS model if it exists (from CI build)
if [ -d "scripts/models" ]; then
  cp -r scripts/models "$RES_DIR/scripts/models"
fi

# Icons (install into hicolor theme so desktop environments pick them up)
for size in 32 128 256; do
  dest="/usr/share/icons/hicolor/${size}x${size}/apps"
  mkdir -p "$dest"
  rm -f "$dest/en-croissant.png"
  if [ "$size" = "256" ]; then
    cp "src-tauri/icons/128x128@2x.png" "$dest/en-parlant.png"
  elif [ "$size" = "128" ]; then
    cp "src-tauri/icons/128x128.png" "$dest/en-parlant.png"
  elif [ "$size" = "32" ]; then
    cp "src-tauri/icons/32x32.png" "$dest/en-parlant.png"
  fi
done
# Also install a scalable-size icon
mkdir -p /usr/share/icons/hicolor/512x512/apps
cp "src-tauri/icons/icon.png" /usr/share/icons/hicolor/512x512/apps/en-parlant.png
# Update icon cache
gtk-update-icon-cache /usr/share/icons/hicolor/ 2>/dev/null || true

# Desktop entry (remove old, install new)
rm -f /usr/share/applications/en-croissant-TTS.desktop
cat > /usr/share/applications/en-parlant.desktop <<'EOF'
[Desktop Entry]
Type=Application
Name=En Parlant~
Exec=en-parlant %f
Icon=en-parlant
StartupWMClass=en-parlant
StartupNotify=false
Comment=Chess Database with TTS
Categories=Game;BoardGame;
Terminal=false
MimeType=application/x-chess-pgn;application/vnd.chess-pgn;
EOF

# Update MIME database so the desktop file is picked up
update-desktop-database /usr/share/applications 2>/dev/null || true

# Set En Parlant~ as the default handler for PGN files.
# Both the primary type (vnd.chess-pgn) and its alias (x-chess-pgn) are set.
_set_mime_defaults() {
  local cfg="$1"
  mkdir -p "$(dirname "$cfg")"
  touch "$cfg"
  grep -q '^\[Default Applications\]' "$cfg" || echo '[Default Applications]' >> "$cfg"
  sed -i '/^application\/x-chess-pgn=/d;/^application\/vnd\.chess-pgn=/d' "$cfg"
  sed -i '/^\[Default Applications\]/a application/x-chess-pgn=en-parlant.desktop\napplication/vnd.chess-pgn=en-parlant.desktop' "$cfg"
}

# System-wide default (for users without a personal preference)
_set_mime_defaults /usr/share/applications/mimeapps.list

# Per-user default for whoever ran sudo
if [ -n "$SUDO_USER" ]; then
  USER_HOME=$(getent passwd "$SUDO_USER" | cut -d: -f6)
  _set_mime_defaults "$USER_HOME/.config/mimeapps.list"
fi

echo "Installed en-parlant"
echo "  Binary:    /usr/bin/en-parlant"
echo "  Resources: $RES_DIR/"
echo "  Desktop:   /usr/share/applications/en-parlant.desktop"
