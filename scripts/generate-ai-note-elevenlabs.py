#!/usr/bin/env python3
"""
Generate AI note audio in all 8 languages using ElevenLabs voices.

These files are NOT bundled with the app (ElevenLabs TOS: non-sublicensable).
They are hosted on redshed.ai and streamed at runtime.

Usage:
    python3 scripts/generate-ai-note-elevenlabs.py --api-key YOUR_ELEVENLABS_KEY

Output:
    src-tauri/resources/audio/elevenlabs/george/ai-note-en.mp3
    src-tauri/resources/audio/elevenlabs/lily/ai-note-en.mp3
    ... (16 files total: 8 languages x 2 voices)
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.request
import urllib.error

# ElevenLabs voices
VOICES = {
    "george": {
        "id": "JBFqnCBsd6RMkjVDRZzb",
        "name": "George - Warm, Captivating Storyteller",
    },
    "lily": {
        "id": "pFZP5JQG7iQjIQuC4Bku",
        "name": "Lily - Velvety Actress",
    },
}

# ElevenLabs language codes for multilingual models
LANGUAGE_CODES = {
    "en": "en",
    "fr": "fr",
    "es": "es",
    "de": "de",
    "ja": "ja",
    "ru": "ru",
    "zh": "zh",
    "ko": "ko",
}

# Map language code to source markdown file
SOURCE_FILES = {
    "en": "docs/ai-note.md",
    "fr": "docs/ai-note-fr.md",
    "es": "docs/ai-note-es.md",
    "de": "docs/ai-note-de.md",
    "ja": "docs/ai-note-ja.md",
    "ru": "docs/ai-note-ru.md",
    "zh": "docs/ai-note-zh.md",
    "ko": "docs/ai-note-ko.md",
}

ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1/text-to-speech"

# ElevenLabs limit: 5000 chars per request on most plans
CHUNK_CHAR_LIMIT = 4800

# Section break — a long pause rendered as a silent gap in speech
SECTION_PAUSE = "\n\n...\n\n"


def clean_for_speech(markdown_text: str) -> str:
    """Strip markdown to pure spoken text with section pauses."""
    lines = markdown_text.strip().split("\n")
    cleaned = []
    skip_preamble = True
    skip_footer = False

    for line in lines:
        stripped = line.strip()

        # Skip the language selector block at the top
        if skip_preamble:
            if stripped.startswith("*This note") or stripped.startswith("*Esta nota") or \
               stripped.startswith("*Cette note") or stripped.startswith("*Diese Notiz") or \
               stripped.startswith("*この文章は") or stripped.startswith("*Эта заметка") or \
               stripped.startswith("*本文还有") or stripped.startswith("*이 글은"):
                skip_preamble = False
                continue
            if stripped.startswith("[") and stripped.endswith("*"):
                continue
            if stripped == "":
                continue
            # Keep the title
            if stripped.startswith("#"):
                title = re.sub(r"^#+\s*", "", stripped)
                cleaned.append(title)
                cleaned.append("")
                continue
            continue

        # Skip language link continuation lines
        if re.match(r"^\[.+\]\(.+\)\s*\|?\s*$", stripped):
            continue
        if re.match(r"^\[.+\]\(.+\)\*\s*$", stripped):
            continue

        # Skip horizontal rules
        if stripped == "---":
            skip_footer = True
            continue

        # Skip the italic footer tagline
        if skip_footer:
            continue

        # Section headings — insert pause marker, then heading text
        if stripped.startswith("#"):
            heading = re.sub(r"^#+\s*", "", stripped)
            cleaned.append(SECTION_PAUSE.strip())
            cleaned.append(heading)
            cleaned.append("")
            continue

        # Strip markdown links: [text](url) -> text
        line_clean = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", stripped)

        # Strip bold/italic markers
        line_clean = re.sub(r"\*\*([^*]+)\*\*", r"\1", line_clean)
        line_clean = re.sub(r"\*([^*]+)\*", r"\1", line_clean)
        line_clean = re.sub(r"_([^_]+)_", r"\1", line_clean)

        # Strip backticks
        line_clean = line_clean.replace("`", "")

        # Curly quotes to straight
        line_clean = line_clean.replace("\u201c", '"').replace("\u201d", '"')
        line_clean = line_clean.replace("\u2018", "'").replace("\u2019", "'")

        cleaned.append(line_clean)

    text = "\n".join(cleaned).strip()
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text


def chunk_text(text: str, char_limit: int) -> list[str]:
    """Split text into chunks within the character limit.
    Prefers splitting on section pauses, then paragraphs, then sentences."""
    # Split on section pauses first
    sections = text.split("...")
    chunks = []
    current = ""

    for section in sections:
        section = section.strip()
        if not section:
            continue

        if current:
            candidate = current + SECTION_PAUSE + section
        else:
            candidate = section

        if len(candidate) <= char_limit:
            current = candidate
        else:
            if current:
                chunks.append(current)
            # If a single section exceeds the limit, split by paragraphs
            if len(section) > char_limit:
                paragraphs = section.split("\n\n")
                current = ""
                for para in paragraphs:
                    para = para.strip()
                    if not para:
                        continue
                    candidate = (current + "\n\n" + para) if current else para
                    if len(candidate) <= char_limit:
                        current = candidate
                    else:
                        if current:
                            chunks.append(current)
                        # Split by sentences if paragraph is too long
                        if len(para) > char_limit:
                            sentences = re.split(r"(?<=[.!?])\s+", para)
                            current = ""
                            for sent in sentences:
                                candidate = (current + " " + sent) if current else sent
                                if len(candidate) <= char_limit:
                                    current = candidate
                                else:
                                    if current:
                                        chunks.append(current)
                                    current = sent
                        else:
                            current = para
            else:
                current = section

    if current:
        chunks.append(current)

    return chunks


def synthesize_chunk(text: str, voice_id: str, api_key: str, lang: str) -> bytes:
    """Call ElevenLabs API and return MP3 audio bytes."""
    payload = {
        "text": text,
        "model_id": "eleven_turbo_v2_5",
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.75,
            "style": 0.0,
            "use_speaker_boost": True,
        },
        "language_code": lang,
    }

    url = f"{ELEVENLABS_API_URL}/{voice_id}"
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "xi-api-key": api_key,
            "Accept": "audio/mpeg",
        },
    )

    try:
        with urllib.request.urlopen(req) as resp:
            return resp.read()
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"  API error {e.code}: {body}", file=sys.stderr)
        raise


def generate_language(lang: str, voice_key: str, api_key: str,
                      project_root: str, output_dir: str):
    """Generate audio for a single language with a single voice."""
    source_path = os.path.join(project_root, SOURCE_FILES[lang])
    voice = VOICES[voice_key]

    if not os.path.exists(source_path):
        print(f"  SKIP {lang}: {source_path} not found")
        return

    with open(source_path, "r", encoding="utf-8") as f:
        markdown = f.read()

    print(f"  [{lang}/{voice_key}] Cleaning text...")
    text = clean_for_speech(markdown)

    print(f"  [{lang}/{voice_key}] Text length: {len(text)} chars")

    chunks = chunk_text(text, CHUNK_CHAR_LIMIT)
    print(f"  [{lang}/{voice_key}] Split into {len(chunks)} chunks")

    audio_parts = []
    el_lang = LANGUAGE_CODES[lang]

    for i, chunk in enumerate(chunks):
        print(f"  [{lang}/{voice_key}] Synthesizing chunk {i + 1}/{len(chunks)} "
              f"({len(chunk)} chars)...")
        audio = synthesize_chunk(chunk, voice["id"], api_key, el_lang)
        audio_parts.append(audio)
        # Rate limiting
        if i < len(chunks) - 1:
            time.sleep(1.0)

    output_path = os.path.join(output_dir, f"ai-note-{lang}.mp3")
    with open(output_path, "wb") as f:
        for part in audio_parts:
            f.write(part)

    total_size = os.path.getsize(output_path)
    print(f"  [{lang}/{voice_key}] Done: {output_path} ({total_size:,} bytes)")


def main():
    parser = argparse.ArgumentParser(
        description="Generate AI note audio via ElevenLabs (for server hosting, not bundling)"
    )
    parser.add_argument(
        "--api-key",
        required=True,
        help="ElevenLabs API key",
    )
    parser.add_argument(
        "--lang",
        default=None,
        help="Generate only this language (e.g., 'en'). Default: all",
    )
    parser.add_argument(
        "--voice",
        default=None,
        choices=["george", "lily"],
        help="Generate only this voice. Default: both",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show cleaned text and chunks without calling API",
    )
    args = parser.parse_args()

    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)

    languages = [args.lang] if args.lang else list(SOURCE_FILES.keys())
    voice_keys = [args.voice] if args.voice else ["george", "lily"]

    total_files = len(languages) * len(voice_keys)
    print(f"Generating {total_files} audio files")
    print(f"Languages: {', '.join(languages)}")
    print(f"Voices: {', '.join(voice_keys)}")
    print()

    for voice_key in voice_keys:
        output_dir = os.path.join(
            project_root, "src-tauri", "resources", "audio", "elevenlabs", voice_key
        )
        os.makedirs(output_dir, exist_ok=True)

        for lang in languages:
            if lang not in SOURCE_FILES:
                print(f"  Unknown language: {lang}")
                continue

            if args.dry_run:
                source_path = os.path.join(project_root, SOURCE_FILES[lang])
                with open(source_path, "r", encoding="utf-8") as f:
                    markdown = f.read()
                text = clean_for_speech(markdown)
                chunks = chunk_text(text, CHUNK_CHAR_LIMIT)
                print(f"=== {lang}/{voice_key} ===")
                print(f"Text length: {len(text)} chars")
                print(f"Chunks: {len(chunks)}")
                for i, chunk in enumerate(chunks):
                    print(f"\n--- Chunk {i + 1} ({len(chunk)} chars) ---")
                    preview = chunk[:150] + "..." if len(chunk) > 150 else chunk
                    print(preview)
                print()
            else:
                generate_language(lang, voice_key, args.api_key,
                                  project_root, output_dir)
                # Pause between languages to avoid rate limits
                time.sleep(0.5)

    print("\nDone.")


if __name__ == "__main__":
    main()
