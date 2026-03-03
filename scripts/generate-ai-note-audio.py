#!/usr/bin/env python3
"""
Generate bundled MP3 audio of the AI note in all 8 languages.

Uses Google Cloud TTS WaveNet voices. Output is licensed for redistribution
under GPL-3.0 (Google Cloud TOS: customer retains all IP on generated audio).

Usage:
    python3 scripts/generate-ai-note-audio.py --api-key YOUR_GOOGLE_CLOUD_API_KEY

Output:
    src-tauri/resources/audio/ai-note-en.mp3
    src-tauri/resources/audio/ai-note-fr.mp3
    ... (8 files total)
"""

import argparse
import base64
import json
import os
import re
import sys
import time
import urllib.request
import urllib.error
from xml.sax.saxutils import escape as xml_escape

# Google Cloud TTS WaveNet voices — male, matching the app's defaults
VOICES = {
    "en": {"languageCode": "en-US", "name": "en-US-WaveNet-D"},
    "fr": {"languageCode": "fr-FR", "name": "fr-FR-WaveNet-G"},
    "es": {"languageCode": "es-ES", "name": "es-ES-WaveNet-E"},
    "de": {"languageCode": "de-DE", "name": "de-DE-WaveNet-H"},
    "ja": {"languageCode": "ja-JP", "name": "ja-JP-WaveNet-D"},
    "ru": {"languageCode": "ru-RU", "name": "ru-RU-WaveNet-B"},
    "zh": {"languageCode": "cmn-CN", "name": "cmn-CN-WaveNet-B"},
    "ko": {"languageCode": "ko-KR", "name": "ko-KR-WaveNet-C"},
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

GOOGLE_TTS_URL = "https://texttospeech.googleapis.com/v1/text:synthesize"

# Google Cloud TTS limit per request (bytes, not characters)
# SSML has more overhead than plain text, so use a tighter limit
CHUNK_BYTE_LIMIT = 4500  # stay under 5000 with SSML wrapper margin

# Marker inserted where section headings were — converted to SSML <break> later
SECTION_BREAK = "\n\n<<SECTION_BREAK>>\n\n"


def clean_for_speech(markdown_text: str, lang: str) -> str:
    """Strip markdown to pure spoken text with section break markers."""
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

        # Skip the italic footer tagline (starts with *)
        if skip_footer:
            continue

        # Section headings become break markers + heading text
        if stripped.startswith("#"):
            heading = re.sub(r"^#+\s*", "", stripped)
            cleaned.append(SECTION_BREAK.strip())
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

        # Curly quotes to straight (TTS handles both, but consistency)
        line_clean = line_clean.replace("\u201c", '"').replace("\u201d", '"')
        line_clean = line_clean.replace("\u2018", "'").replace("\u2019", "'")

        # Em dash — keep, TTS handles it as a pause
        # Ellipsis ... keep

        cleaned.append(line_clean)

    text = "\n".join(cleaned).strip()

    # Collapse multiple blank lines to one
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text


def text_to_ssml(text: str) -> str:
    """Convert cleaned text with section break markers to SSML.

    Section breaks become <break time="1.5s"/> for a natural pause
    between topics. Paragraph breaks get a shorter pause."""
    # XML-escape the text first (handles &, <, >)
    escaped = xml_escape(text)

    # Replace section break markers with SSML breaks
    escaped = escaped.replace(
        "&lt;&lt;SECTION_BREAK&gt;&gt;",
        '<break time="1.5s"/>',
    )

    # Paragraph breaks (double newline) get a moderate pause
    escaped = escaped.replace("\n\n", '\n<break time="0.6s"/>\n')

    # Single newlines within paragraphs — just a space
    escaped = escaped.replace("\n", " ")

    return f"<speak>{escaped}</speak>"


def chunk_text(text: str, byte_limit: int) -> list[str]:
    """Split text into chunks that fit within the SSML byte limit.
    Splits on section breaks first, then paragraph boundaries, then sentences."""
    # Split on section breaks first — these are natural boundaries
    sections = text.split("<<SECTION_BREAK>>")
    chunks = []
    current = ""

    for section in sections:
        section = section.strip()
        if not section:
            continue

        # Try adding this section to current chunk (with break marker)
        if current:
            candidate = current + SECTION_BREAK.strip() + "\n\n" + section
        else:
            candidate = section

        ssml_size = len(text_to_ssml(candidate).encode("utf-8"))
        if ssml_size <= byte_limit:
            current = candidate
        else:
            if current:
                chunks.append(current)
            # If a single section exceeds the limit, split by paragraphs
            if len(text_to_ssml(section).encode("utf-8")) > byte_limit:
                paragraphs = section.split("\n\n")
                current = ""
                for para in paragraphs:
                    para = para.strip()
                    if not para:
                        continue
                    if current:
                        candidate = current + "\n\n" + para
                    else:
                        candidate = para
                    if len(text_to_ssml(candidate).encode("utf-8")) <= byte_limit:
                        current = candidate
                    else:
                        if current:
                            chunks.append(current)
                        # If a single paragraph exceeds limit, split by sentences
                        if len(text_to_ssml(para).encode("utf-8")) > byte_limit:
                            sentences = re.split(r"(?<=[.!?])\s+", para)
                            current = ""
                            for sent in sentences:
                                if current:
                                    candidate = current + " " + sent
                                else:
                                    candidate = sent
                                if len(text_to_ssml(candidate).encode("utf-8")) <= byte_limit:
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


def synthesize_chunk(text: str, voice: dict, api_key: str) -> bytes:
    """Call Google Cloud TTS API with SSML and return MP3 audio bytes."""
    ssml = text_to_ssml(text)

    payload = {
        "input": {"ssml": ssml},
        "voice": {
            "languageCode": voice["languageCode"],
            "name": voice["name"],
            "ssmlGender": "MALE",
        },
        "audioConfig": {
            "audioEncoding": "MP3",
            "speakingRate": 1.0,
            "pitch": 0.0,
        },
    }

    url = f"{GOOGLE_TTS_URL}?key={api_key}"
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
    )

    try:
        with urllib.request.urlopen(req) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            return base64.b64decode(result["audioContent"])
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"  API error {e.code}: {body}", file=sys.stderr)
        raise


def generate_language(lang: str, api_key: str, project_root: str, output_dir: str):
    """Generate audio for a single language."""
    source_path = os.path.join(project_root, SOURCE_FILES[lang])

    if not os.path.exists(source_path):
        print(f"  SKIP {lang}: {source_path} not found")
        return

    with open(source_path, "r", encoding="utf-8") as f:
        markdown = f.read()

    print(f"  [{lang}] Cleaning text...")
    text = clean_for_speech(markdown, lang)

    print(f"  [{lang}] Text length: {len(text)} chars, {len(text.encode('utf-8'))} bytes")

    chunks = chunk_text(text, CHUNK_BYTE_LIMIT)
    print(f"  [{lang}] Split into {len(chunks)} chunks")

    voice = VOICES[lang]
    audio_parts = []

    for i, chunk in enumerate(chunks):
        print(f"  [{lang}] Synthesizing chunk {i + 1}/{len(chunks)} "
              f"({len(chunk.encode('utf-8'))} bytes)...")
        audio = synthesize_chunk(chunk, voice, api_key)
        audio_parts.append(audio)
        # Rate limiting: be polite to the API
        if i < len(chunks) - 1:
            time.sleep(0.3)

    # Concatenate MP3 chunks (MP3 frames are independently decodable)
    output_path = os.path.join(output_dir, f"ai-note-{lang}.mp3")
    with open(output_path, "wb") as f:
        for part in audio_parts:
            f.write(part)

    total_size = os.path.getsize(output_path)
    print(f"  [{lang}] Done: {output_path} ({total_size:,} bytes)")


def main():
    parser = argparse.ArgumentParser(
        description="Generate AI note audio in all 8 languages via Google Cloud TTS"
    )
    parser.add_argument(
        "--api-key",
        required=True,
        help="Google Cloud API key with Text-to-Speech API enabled",
    )
    parser.add_argument(
        "--lang",
        default=None,
        help="Generate only this language (e.g., 'en', 'fr'). Default: all",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Clean text and show chunks without calling the API",
    )
    args = parser.parse_args()

    # Find project root (script is in scripts/)
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)

    output_dir = os.path.join(project_root, "src-tauri", "resources", "audio")
    os.makedirs(output_dir, exist_ok=True)

    languages = [args.lang] if args.lang else list(VOICES.keys())

    print(f"Generating AI note audio for: {', '.join(languages)}")
    print(f"Output directory: {output_dir}")
    print()

    for lang in languages:
        if lang not in VOICES:
            print(f"  Unknown language: {lang}")
            continue

        if args.dry_run:
            source_path = os.path.join(project_root, SOURCE_FILES[lang])
            with open(source_path, "r", encoding="utf-8") as f:
                markdown = f.read()
            text = clean_for_speech(markdown, lang)
            chunks = chunk_text(text, CHUNK_BYTE_LIMIT)
            print(f"=== {lang} ===")
            print(f"Text length: {len(text)} chars, {len(text.encode('utf-8'))} bytes")
            print(f"Chunks: {len(chunks)}")
            for i, chunk in enumerate(chunks):
                print(f"\n--- Chunk {i + 1} ({len(chunk.encode('utf-8'))} bytes) ---")
                print(chunk[:200] + "..." if len(chunk) > 200 else chunk)
            print()
        else:
            generate_language(lang, args.api_key, project_root, output_dir)

    print("\nDone.")


if __name__ == "__main__":
    main()
