#!/bin/bash
set -e

# Update desktop MIME database so the new desktop file is recognized
update-desktop-database /usr/share/applications 2>/dev/null || true

# Set En Parlant~ as the system-wide default handler for PGN files.
# Users with a personal ~/.config/mimeapps.list override will keep their
# own preference; this only affects users who haven't set one.
_set_mime_defaults() {
  local cfg="$1"
  mkdir -p "$(dirname "$cfg")"
  touch "$cfg"
  grep -q '^\[Default Applications\]' "$cfg" || echo '[Default Applications]' >> "$cfg"
  sed -i '/^application\/x-chess-pgn=/d;/^application\/vnd\.chess-pgn=/d' "$cfg"
  sed -i '/^\[Default Applications\]/a application/x-chess-pgn=en-parlant.desktop\napplication/vnd.chess-pgn=en-parlant.desktop' "$cfg"
}

_set_mime_defaults /usr/share/applications/mimeapps.list
