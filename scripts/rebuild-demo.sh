#!/usr/bin/env bash
#
# One-shot demo rebuild pipeline.
#
# Translates a commented English PGN to 9 languages, generates narration text,
# synthesizes audio via ElevenLabs, uploads to R2, builds the app, and deploys.
#
# Usage:
#   ./scripts/rebuild-demo.sh \
#     --pgn path/to/game.pgn \
#     --elevenlabs-key KEY \
#     --anthropic-key KEY \
#     --male-voice onwK4e9ZLuTAKqWW03F9 \
#     --female-voice pFZP5JQG7iQjIQuC4Bku \
#     [--model eleven_turbo_v2_5] \
#     [--skip-backup] [--skip-build] [--skip-deploy] [--dry-run]
#
# All flags can also be set via env vars:
#   ELEVENLABS_API_KEY, ANTHROPIC_API_KEY, DEMO_MALE_VOICE, DEMO_FEMALE_VOICE

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BASE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SITE_DIR="/data/src/enparlant-site"

# ─── Defaults ─────────────────────────────────────────────────────────────────

PGN_FILE=""
ELEVENLABS_KEY="${ELEVENLABS_API_KEY:-}"
ANTHROPIC_KEY="${ANTHROPIC_API_KEY:-}"
MALE_VOICE="${DEMO_MALE_VOICE:-onwK4e9ZLuTAKqWW03F9}"   # Daniel
FEMALE_VOICE="${DEMO_FEMALE_VOICE:-pFZP5JQG7iQjIQuC4Bku}" # Lily
MODEL="eleven_turbo_v2_5"
SKIP_BACKUP=false
SKIP_BUILD=false
SKIP_DEPLOY=false
DRY_RUN=false

LANGUAGES="en fr de es ja ru zh ko hi"
GENDERS="male female"

# ─── Argument parsing ─────────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
  case "$1" in
    --pgn)            PGN_FILE="$2";       shift 2 ;;
    --elevenlabs-key) ELEVENLABS_KEY="$2"; shift 2 ;;
    --anthropic-key)  ANTHROPIC_KEY="$2";  shift 2 ;;
    --male-voice)     MALE_VOICE="$2";     shift 2 ;;
    --female-voice)   FEMALE_VOICE="$2";   shift 2 ;;
    --model)          MODEL="$2";          shift 2 ;;
    --skip-backup)    SKIP_BACKUP=true;    shift ;;
    --skip-build)     SKIP_BUILD=true;     shift ;;
    --skip-deploy)    SKIP_DEPLOY=true;    shift ;;
    --dry-run)        DRY_RUN=true;        shift ;;
    -h|--help)
      echo "Usage: $0 --pgn FILE --elevenlabs-key KEY --anthropic-key KEY [options]"
      echo ""
      echo "Options:"
      echo "  --pgn FILE            Input English PGN with comments"
      echo "  --elevenlabs-key KEY  ElevenLabs API key (or ELEVENLABS_API_KEY)"
      echo "  --anthropic-key KEY   Anthropic API key (or ANTHROPIC_API_KEY)"
      echo "  --male-voice ID       Male voice ID (default: Daniel)"
      echo "  --female-voice ID     Female voice ID (default: Lily)"
      echo "  --model MODEL         ElevenLabs model (default: eleven_turbo_v2_5)"
      echo "  --skip-backup         Skip backing up existing demo files"
      echo "  --skip-build          Skip Tauri app build and install"
      echo "  --skip-deploy         Skip git commit/push and website deploy"
      echo "  --dry-run             Show plan without executing API calls"
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ─── Banner ───────────────────────────────────────────────────────────────────

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║          En Parlant — Demo Rebuild Pipeline          ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ─── Step 1: Validate prerequisites ──────────────────────────────────────────

echo "=== Step 1: Validate prerequisites ==="

errors=0

if [[ -z "$PGN_FILE" ]]; then
  echo "  ERROR: --pgn is required"
  errors=$((errors + 1))
elif [[ ! -f "$PGN_FILE" ]]; then
  echo "  ERROR: PGN file not found: $PGN_FILE"
  errors=$((errors + 1))
else
  echo "  PGN:            $PGN_FILE"
fi

if [[ -z "$ELEVENLABS_KEY" ]]; then
  echo "  ERROR: --elevenlabs-key is required (or set ELEVENLABS_API_KEY)"
  errors=$((errors + 1))
else
  echo "  ElevenLabs key: ****${ELEVENLABS_KEY: -4}"
fi

if [[ -z "$ANTHROPIC_KEY" ]]; then
  echo "  ERROR: --anthropic-key is required (or set ANTHROPIC_API_KEY)"
  errors=$((errors + 1))
else
  echo "  Anthropic key:  ****${ANTHROPIC_KEY: -4}"
fi

echo "  Male voice:     $MALE_VOICE"
echo "  Female voice:   $FEMALE_VOICE"
echo "  Model:          $MODEL"
echo "  Dry run:        $DRY_RUN"

# Check required tools
for cmd in python3 curl jq; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "  ERROR: $cmd not found"
    errors=$((errors + 1))
  fi
done

if [[ "$SKIP_BUILD" == false ]]; then
  for cmd in pnpm; do
    if ! command -v "$cmd" &>/dev/null; then
      echo "  ERROR: $cmd not found (use --skip-build to skip)"
      errors=$((errors + 1))
    fi
  done
fi

if [[ "$SKIP_DEPLOY" == false ]]; then
  for cmd in wrangler; do
    if ! command -v "$cmd" &>/dev/null; then
      echo "  WARNING: wrangler not found (R2 upload will be skipped)"
    fi
  done
fi

# Check Python packages
if ! python3 -c "import anthropic" 2>/dev/null; then
  echo "  ERROR: Python 'anthropic' package not found. Run: pip install anthropic"
  errors=$((errors + 1))
fi
if ! python3 -c "import chess" 2>/dev/null; then
  echo "  ERROR: Python 'chess' package not found. Run: pip install chess"
  errors=$((errors + 1))
fi

if [[ $errors -gt 0 ]]; then
  echo ""
  echo "Aborting: $errors error(s) found."
  exit 1
fi
echo ""

# ─── Step 2: Backup existing demo ────────────────────────────────────────────

if [[ "$SKIP_BACKUP" == true ]]; then
  echo "=== Step 2: Backup (SKIPPED) ==="
else
  echo "=== Step 2: Backup existing demo ==="
  BACKUP_DIR="$BASE_DIR/docs/demos/backups/demo-$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$BACKUP_DIR"

  # Backup PGN files
  pgn_count=0
  for f in "$BASE_DIR"/docs/demos/tts-demo-*.pgn; do
    [[ -f "$f" ]] || continue
    cp "$f" "$BACKUP_DIR/"
    pgn_count=$((pgn_count + 1))
  done

  # Backup narration directory
  if [[ -d "$BASE_DIR/docs/demos/narration" ]]; then
    cp -r "$BASE_DIR/docs/demos/narration" "$BACKUP_DIR/narration"
  fi

  echo "  Backed up $pgn_count PGN files + narration/ to:"
  echo "  $BACKUP_DIR"
fi
echo ""

# ─── Step 3: Translate PGN & generate narration text ─────────────────────────

echo "=== Step 3: Translate PGN & generate narration text ==="

python_args=(
  "$SCRIPT_DIR/rebuild-demo.py"
  --pgn "$PGN_FILE"
  --anthropic-key "$ANTHROPIC_KEY"
  --output-dir "$BASE_DIR/docs/demos"
)

if [[ "$DRY_RUN" == true ]]; then
  python_args+=(--dry-run)
fi

python3 "${python_args[@]}"
echo ""

if [[ "$DRY_RUN" == true ]]; then
  echo "Dry run complete. No audio generated, no uploads, no build."
  exit 0
fi

# ─── Step 4: Generate audio clips (ElevenLabs) ───────────────────────────────

echo "=== Step 4: Generate audio clips via ElevenLabs ==="

DEMOS_DIR="$BASE_DIR/docs/demos"
API_URL="https://api.elevenlabs.io/v1/text-to-speech"

total_clips=0
generated=0
skipped=0
errors=0

# Count total clips first
for lang in $LANGUAGES; do
  for txt_file in "$DEMOS_DIR/narration/$lang"/move-*.txt; do
    [[ -f "$txt_file" ]] || continue
    for gender in $GENDERS; do
      total_clips=$((total_clips + 1))
    done
  done
done

echo "  Total clips to process: $total_clips ($(echo $LANGUAGES | wc -w) languages × 2 genders)"
echo ""

for lang in $LANGUAGES; do
  for gender in $GENDERS; do
    if [[ "$gender" == "male" ]]; then
      voice_id="$MALE_VOICE"
    else
      voice_id="$FEMALE_VOICE"
    fi

    output_dir="$DEMOS_DIR/narration/$lang/audio/$gender"
    mkdir -p "$output_dir"

    for txt_file in "$DEMOS_DIR/narration/$lang"/move-*.txt; do
      [[ -f "$txt_file" ]] || continue

      filename="$(basename "$txt_file" .txt)"
      mp3_file="$output_dir/$filename.mp3"
      text="$(cat "$txt_file")"

      current=$((generated + skipped + errors + 1))

      # Skip if already exists (idempotent re-runs)
      if [[ -f "$mp3_file" ]]; then
        skipped=$((skipped + 1))
        continue
      fi

      echo "  [$current/$total_clips] $lang/$gender/$filename (${#text} chars)"

      # Build JSON payload
      if [[ "$lang" == "en" ]]; then
        payload=$(jq -n \
          --arg text "$text" \
          --arg model "$MODEL" \
          '{
            text: $text,
            model_id: $model,
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
              style: 0.0,
              use_speaker_boost: true
            }
          }')
      else
        payload=$(jq -n \
          --arg text "$text" \
          --arg model "$MODEL" \
          --arg lang_code "$lang" \
          '{
            text: $text,
            model_id: $model,
            language_code: $lang_code,
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
              style: 0.0,
              use_speaker_boost: true
            }
          }')
      fi

      http_code=$(curl -s -o "$mp3_file" -w "%{http_code}" \
        -X POST "$API_URL/$voice_id" \
        -H "xi-api-key: $ELEVENLABS_KEY" \
        -H "Content-Type: application/json" \
        -d "$payload")

      if [[ "$http_code" -ne 200 ]]; then
        echo "    ERROR: HTTP $http_code"
        if [[ -f "$mp3_file" ]]; then
          cat "$mp3_file" 2>/dev/null || true
          rm -f "$mp3_file"
        fi
        echo ""
        errors=$((errors + 1))
        if [[ $errors -ge 5 ]]; then
          echo "  Too many errors ($errors), aborting audio generation."
          break 3
        fi
        sleep 2  # back off on error
        continue
      fi

      size=$(stat --printf="%s" "$mp3_file" 2>/dev/null || stat -f%z "$mp3_file" 2>/dev/null)
      echo "    OK ($size bytes)"
      generated=$((generated + 1))

      # Rate-limit delay
      sleep 0.5
    done
  done
done

echo ""
echo "  Audio generation complete: $generated generated, $skipped skipped, $errors errors"
echo ""

# ─── Step 5: Upload audio to R2 ──────────────────────────────────────────────

echo "=== Step 5: Upload audio to R2 ==="

if ! command -v wrangler &>/dev/null; then
  echo "  SKIPPED: wrangler not found"
else
  uploaded=0

  # Upload PGN files
  for lang in $LANGUAGES; do
    pgn="$DEMOS_DIR/tts-demo-${lang}.pgn"
    [[ -f "$pgn" ]] || continue
    r2_key="enparlant-assets/pgn/demo/tts-demo-${lang}.pgn"
    echo "  $r2_key"
    wrangler r2 object put "$r2_key" \
      --file "$pgn" --remote --content-type text/plain 2>/dev/null
    uploaded=$((uploaded + 1))
  done

  # Upload audio files
  for lang in $LANGUAGES; do
    for gender in $GENDERS; do
      audio_dir="$DEMOS_DIR/narration/$lang/audio/$gender"
      [[ -d "$audio_dir" ]] || continue
      for mp3 in "$audio_dir"/move-*.mp3; do
        [[ -f "$mp3" ]] || continue
        filename=$(basename "$mp3")
        r2_key="enparlant-assets/audio/demo/$lang/$gender/$filename"
        echo "  $r2_key"
        wrangler r2 object put "$r2_key" \
          --file "$mp3" --remote --content-type audio/mpeg 2>/dev/null
        uploaded=$((uploaded + 1))
      done
    done
  done

  echo "  Uploaded $uploaded files to R2"
fi
echo ""

# ─── Step 6: Build Tauri app ─────────────────────────────────────────────────

if [[ "$SKIP_BUILD" == true ]]; then
  echo "=== Step 6: Build Tauri app (SKIPPED) ==="
else
  echo "=== Step 6: Build Tauri app ==="
  cd "$BASE_DIR"
  pnpm tauri build
  echo "  Installing .deb..."
  sudo dpkg -i src-tauri/target/release/bundle/deb/en-parlant_*.deb
  echo "  Build + install complete"
fi
echo ""

# ─── Step 7: Commit and push ─────────────────────────────────────────────────

if [[ "$SKIP_DEPLOY" == true ]]; then
  echo "=== Step 7: Commit and push (SKIPPED) ==="
else
  echo "=== Step 7: Commit and push ==="
  cd "$BASE_DIR"
  git add docs/demos/tts-demo-*.pgn docs/demos/narration/
  git commit -m "$(cat <<'EOF'
Regenerate demo: 9 languages × 2 genders

- Translated PGN comments via Claude API
- Generated narration text for all languages
- Audio clips generated via ElevenLabs (Daniel/Lily)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
  )"
  git push
  echo "  Committed and pushed"
fi
echo ""

# ─── Step 8: Deploy website ──────────────────────────────────────────────────

if [[ "$SKIP_DEPLOY" == true ]]; then
  echo "=== Step 8: Deploy website (SKIPPED) ==="
else
  echo "=== Step 8: Deploy website ==="
  cd "$SITE_DIR"
  pnpm run deploy
  echo "  Website deployed"
fi
echo ""

# ─── Done ─────────────────────────────────────────────────────────────────────

echo "╔══════════════════════════════════════════════════════╗"
echo "║                  Pipeline complete!                  ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "Verification checklist:"
echo "  1. Spot-check narration text:  cat docs/demos/narration/fr/move-5.txt"
echo "  2. Play an audio clip:         mpv docs/demos/narration/fr/audio/male/move-5.mp3"
echo "  3. Check R2:                   curl -sI https://enparlant.redshed.ai/audio/demo/fr/male/move-0.mp3"
echo "  4. Test in app:                TTS Demo (Male) > Français"
echo "  5. Test female voice:          TTS Demo (Female) > English"
echo ""
