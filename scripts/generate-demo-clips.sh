#!/usr/bin/env bash
#
# Generate demo narration clips via ElevenLabs TTS API.
#
# Usage:
#   ./scripts/generate-demo-clips.sh --lang en --gender male --voice VOICE_ID
#   ./scripts/generate-demo-clips.sh --lang en --gender female --voice VOICE_ID
#
# Reads:  docs/demos/narration/{lang}/move-*.txt
# Writes: docs/demos/narration/{lang}/audio/{gender}/move-*.mp3
#
# Requires: curl, ELEVENLABS_API_KEY env var (or --key flag)

set -euo pipefail

LANG="en"
GENDER="male"
VOICE_ID="pNInz6obpgDQGcFmaJgB"  # Adam (default)
API_KEY="${ELEVENLABS_API_KEY:-}"
MODEL="eleven_turbo_v2_5"
DRY_RUN=false

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BASE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --lang)    LANG="$2";     shift 2 ;;
    --gender)  GENDER="$2";   shift 2 ;;
    --voice)   VOICE_ID="$2"; shift 2 ;;
    --key)     API_KEY="$2";  shift 2 ;;
    --model)   MODEL="$2";    shift 2 ;;
    --dry-run) DRY_RUN=true;  shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

if [[ -z "$API_KEY" ]]; then
  echo "Error: Set ELEVENLABS_API_KEY or use --key <key>"
  exit 1
fi

INPUT_DIR="$BASE_DIR/docs/demos/narration/$LANG"
OUTPUT_DIR="$BASE_DIR/docs/demos/narration/$LANG/audio/$GENDER"

if [[ ! -d "$INPUT_DIR" ]]; then
  echo "Error: No narration text files at $INPUT_DIR"
  exit 1
fi

mkdir -p "$OUTPUT_DIR"

API_URL="https://api.elevenlabs.io/v1/text-to-speech/$VOICE_ID"

files=("$INPUT_DIR"/move-*.txt)
total=${#files[@]}
echo "=== ElevenLabs Demo Clip Generator ==="
echo "Language: $LANG | Gender: $GENDER | Voice: $VOICE_ID"
echo "Model:    $MODEL"
echo "Input:    $INPUT_DIR ($total clips)"
echo "Output:   $OUTPUT_DIR"
echo ""

count=0
for txt_file in "${files[@]}"; do
  filename="$(basename "$txt_file" .txt)"
  mp3_file="$OUTPUT_DIR/$filename.mp3"
  text="$(cat "$txt_file")"

  count=$((count + 1))
  echo "[$count/$total] $filename (${#text} chars)"

  if [[ "$DRY_RUN" == true ]]; then
    echo "  DRY RUN: $text"
    echo ""
    continue
  fi

  if [[ -f "$mp3_file" ]]; then
    echo "  SKIP: already exists"
    continue
  fi

  http_code=$(curl -s -o "$mp3_file" -w "%{http_code}" \
    -X POST "$API_URL" \
    -H "xi-api-key: $API_KEY" \
    -H "Content-Type: application/json" \
    -d "$(jq -n \
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
      }'
    )")

  if [[ "$http_code" -ne 200 ]]; then
    echo "  ERROR: HTTP $http_code"
    cat "$mp3_file"  # error body was written here
    rm -f "$mp3_file"
    echo ""
    exit 1
  fi

  size=$(stat --printf="%s" "$mp3_file" 2>/dev/null || stat -f%z "$mp3_file" 2>/dev/null)
  echo "  OK: $mp3_file ($size bytes)"

  # Small delay to avoid rate limiting
  sleep 0.5
done

echo ""
echo "=== Done: $count clips generated ==="
echo ""
echo "To upload to R2:"
echo "  rclone copy $OUTPUT_DIR r2:enparlant/audio/demo/$LANG/$GENDER/ --progress"
