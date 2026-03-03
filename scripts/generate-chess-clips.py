#!/usr/bin/env python3
"""
Generate pre-cached chess move TTS clips using ElevenLabs.

These clips are hosted on a CDN (not bundled) and fetched by the app
at runtime for zero-config TTS in the first 2 minutes of use.

Generates:
  - All piece moves: "King e1", "Knight f3", "Bishop takes e5", etc.
  - Castling: "castles kingside", "castles queenside"
  - Pawn moves: "e4", "d5", etc.
  - Pawn captures: "e takes d5", etc.
  - Check/checkmate suffixes on common moves
  - Promotions
  - Annotations: "Brilliant move", "Good move", etc.
  - Move numbers: "1" through "60"

Output structure:
  output/
    daniel/en/
      pieces/   -> king.mp3, queen.mp3, ...
      files/    -> a.mp3, b.mp3, ...
      ranks/    -> 1.mp3, 2.mp3, ...
      actions/  -> takes.mp3, check.mp3, ...
      moves/    -> king-e1.mp3, knight-f3.mp3, knight-takes-f3.mp3, ...
      castling/ -> kingside.mp3, queenside.mp3
      annotations/ -> brilliant.mp3, good.mp3, ...
      numbers/  -> 1.mp3, 2.mp3, ...
    lily/en/
      ...

Usage:
    python3 scripts/generate-chess-clips.py --api-key YOUR_KEY
    python3 scripts/generate-chess-clips.py --api-key YOUR_KEY --voice daniel --lang en
    python3 scripts/generate-chess-clips.py --api-key YOUR_KEY --dry-run
"""

import argparse
import json
import os
import sys
import time
import urllib.request
import urllib.error

# ─── Voices ───────────────────────────────────────────────────────────────────

VOICES = {
    "daniel": {
        "id": "onwK4e9ZLuTAKqWW03F9",  # Daniel - British, authoritative
        "name": "Daniel",
    },
    "lily": {
        "id": "pFZP5JQG7iQjIQuC4Bku",  # Lily - Velvety Actress
        "name": "Lily",
    },
}

# ─── Chess vocabulary per language ────────────────────────────────────────────

CHESS_VOCAB = {
    "en": {
        "King": "King", "Queen": "Queen", "Rook": "Rook",
        "Bishop": "Bishop", "Knight": "Knight",
        "castlesKingside": "castles kingside",
        "castlesQueenside": "castles queenside",
        "takes": "takes", "check": "check", "checkmate": "checkmate",
        "promotesTo": "promotes to",
        "brilliant": "Brilliant move.",
        "good": "Good move.",
        "interesting": "Interesting move.",
        "dubious": "Dubious move.",
        "mistake": "Mistake.",
        "blunder": "Blunder.",
    },
    "fr": {
        "King": "Roi", "Queen": "Dame", "Rook": "Tour",
        "Bishop": "Fou", "Knight": "Cavalier",
        "castlesKingside": "petit roque",
        "castlesQueenside": "grand roque",
        "takes": "prend", "check": "échec", "checkmate": "échec et mat",
        "promotesTo": "promu en",
        "brilliant": "Coup brillant.",
        "good": "Bon coup.",
        "interesting": "Coup intéressant.",
        "dubious": "Coup douteux.",
        "mistake": "Erreur.",
        "blunder": "Gaffe.",
    },
    "es": {
        "King": "Rey", "Queen": "Dama", "Rook": "Torre",
        "Bishop": "Alfil", "Knight": "Caballo",
        "castlesKingside": "enroque corto",
        "castlesQueenside": "enroque largo",
        "takes": "captura", "check": "jaque", "checkmate": "jaque mate",
        "promotesTo": "corona a",
        "brilliant": "Jugada brillante.",
        "good": "Buena jugada.",
        "interesting": "Jugada interesante.",
        "dubious": "Jugada dudosa.",
        "mistake": "Error.",
        "blunder": "Pifia.",
    },
    "de": {
        "King": "König", "Queen": "Dame", "Rook": "Turm",
        "Bishop": "Läufer", "Knight": "Springer",
        "castlesKingside": "kurze Rochade",
        "castlesQueenside": "lange Rochade",
        "takes": "schlägt", "check": "Schach", "checkmate": "Schachmatt",
        "promotesTo": "wandelt um in",
        "brilliant": "Brillanter Zug.",
        "good": "Guter Zug.",
        "interesting": "Interessanter Zug.",
        "dubious": "Zweifelhafter Zug.",
        "mistake": "Fehler.",
        "blunder": "Grober Fehler.",
    },
    "ja": {
        "King": "キング", "Queen": "クイーン", "Rook": "ルーク",
        "Bishop": "ビショップ", "Knight": "ナイト",
        "castlesKingside": "キングサイドキャスリング",
        "castlesQueenside": "クイーンサイドキャスリング",
        "takes": "テイクス", "check": "チェック", "checkmate": "チェックメイト",
        "promotesTo": "プロモーション",
        "brilliant": "素晴らしい手。",
        "good": "好手。",
        "interesting": "興味深い手。",
        "dubious": "疑問手。",
        "mistake": "悪手。",
        "blunder": "大悪手。",
    },
    "ru": {
        "King": "Король", "Queen": "Ферзь", "Rook": "Ладья",
        "Bishop": "Слон", "Knight": "Конь",
        "castlesKingside": "рокировка на королевский фланг",
        "castlesQueenside": "рокировка на ферзевый фланг",
        "takes": "берёт", "check": "шах", "checkmate": "мат",
        "promotesTo": "превращается в",
        "brilliant": "Блестящий ход.",
        "good": "Хороший ход.",
        "interesting": "Интересный ход.",
        "dubious": "Сомнительный ход.",
        "mistake": "Ошибка.",
        "blunder": "Грубая ошибка.",
    },
    "zh": {
        "King": "王", "Queen": "后", "Rook": "车",
        "Bishop": "象", "Knight": "马",
        "castlesKingside": "王翼易位",
        "castlesQueenside": "后翼易位",
        "takes": "吃", "check": "将军", "checkmate": "将杀",
        "promotesTo": "升变为",
        "brilliant": "妙招。",
        "good": "好棋。",
        "interesting": "有趣的棋。",
        "dubious": "可疑的棋。",
        "mistake": "错着。",
        "blunder": "漏着。",
    },
    "ko": {
        "King": "킹", "Queen": "퀸", "Rook": "룩",
        "Bishop": "비숍", "Knight": "나이트",
        "castlesKingside": "킹사이드 캐슬링",
        "castlesQueenside": "퀸사이드 캐슬링",
        "takes": "잡음", "check": "체크", "checkmate": "체크메이트",
        "promotesTo": "프로모션",
        "brilliant": "brilliant한 수.",
        "good": "좋은 수.",
        "interesting": "흥미로운 수.",
        "dubious": "의심스러운 수.",
        "mistake": "실수.",
        "blunder": "대실수.",
    },
}

PIECES = ["King", "Queen", "Rook", "Bishop", "Knight"]
FILES = list("abcdefgh")
RANKS = list("12345678")

ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1/text-to-speech"

# ─── Phrase generation ────────────────────────────────────────────────────────

def generate_all_phrases(lang: str) -> list[tuple[str, str, str]]:
    """
    Generate all chess move phrases for a language.
    Returns list of (category, filename, spoken_text).
    """
    v = CHESS_VOCAB[lang]
    pieces = {"K": v["King"], "Q": v["Queen"], "R": v["Rook"],
              "B": v["Bishop"], "N": v["Knight"]}
    phrases = []

    # ── Move numbers (spoken as "1," "2," etc. with natural pause) ──
    for n in range(1, 61):
        phrases.append(("numbers", str(n), f"{n},"))

    # ── Annotations ──
    for key in ["brilliant", "good", "interesting", "dubious", "mistake", "blunder"]:
        phrases.append(("annotations", key, v[key]))

    # ── Castling ──
    phrases.append(("castling", "kingside", v["castlesKingside"]))
    phrases.append(("castling", "queenside", v["castlesQueenside"]))

    # ── Piece moves (no capture): "Knight f3" ──
    for san_piece, spoken_piece in pieces.items():
        for f in FILES:
            for r in RANKS:
                sq = f"{f}{r}"
                fname = f"{spoken_piece.lower()}-{sq}"
                text = f"{spoken_piece} {sq}"
                phrases.append(("moves", fname, text))

    # ── Piece captures: "Knight takes f3" ──
    for san_piece, spoken_piece in pieces.items():
        for f in FILES:
            for r in RANKS:
                sq = f"{f}{r}"
                fname = f"{spoken_piece.lower()}-takes-{sq}"
                text = f"{spoken_piece} {v['takes']} {sq}"
                phrases.append(("moves", fname, text))

    # ── Pawn moves: "e4" ──
    for f in FILES:
        for r in RANKS:
            sq = f"{f}{r}"
            phrases.append(("moves", f"pawn-{sq}", sq))

    # ── Pawn captures: "e takes d5" ──
    for src_f in FILES:
        for dst_f in FILES:
            if src_f == dst_f:
                continue
            # Only adjacent files are realistic captures
            if abs(ord(src_f) - ord(dst_f)) != 1:
                continue
            for r in RANKS:
                sq = f"{dst_f}{r}"
                fname = f"{src_f}-takes-{sq}"
                text = f"{src_f} {v['takes']} {sq}"
                phrases.append(("moves", fname, text))

    # ── Check suffix variants for common pieces ──
    for san_piece, spoken_piece in pieces.items():
        # Just generate a few common check moves per piece
        for f in FILES:
            for r in RANKS:
                sq = f"{f}{r}"
                # Check
                fname = f"{spoken_piece.lower()}-{sq}-check"
                text = f"{spoken_piece} {sq}, {v['check']}"
                phrases.append(("moves", fname, text))
                # Checkmate (less common, skip to save API calls)

    # ── Piece captures with check ──
    for san_piece, spoken_piece in pieces.items():
        for f in FILES:
            for r in RANKS:
                sq = f"{f}{r}"
                fname = f"{spoken_piece.lower()}-takes-{sq}-check"
                text = f"{spoken_piece} {v['takes']} {sq}, {v['check']}"
                phrases.append(("moves", fname, text))

    # ── Promotions: "e8 promotes to Queen" ──
    for f in FILES:
        for promo_piece in ["Queen", "Rook", "Bishop", "Knight"]:
            fname = f"pawn-{f}8-promotes-{promo_piece.lower()}"
            text = f"{f}8 {v['promotesTo']} {v[promo_piece]}"
            phrases.append(("moves", fname, text))

    return phrases


def count_phrases(phrases):
    """Count phrases by category."""
    counts = {}
    for cat, _, _ in phrases:
        counts[cat] = counts.get(cat, 0) + 1
    return counts


# ─── ElevenLabs API ───────────────────────────────────────────────────────────

def synthesize(text: str, voice_id: str, api_key: str, lang: str) -> bytes:
    """Call ElevenLabs TTS API and return MP3 bytes."""
    payload = {
        "text": text,
        "model_id": "eleven_turbo_v2_5",
        "voice_settings": {
            "stability": 0.6,
            "similarity_boost": 0.8,
            "style": 0.0,
            "use_speaker_boost": True,
        },
    }
    if lang != "en":
        payload["language_code"] = lang

    url = f"{ELEVENLABS_API_URL}/{voice_id}"
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url, data=data,
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
        print(f"    API error {e.code}: {body}", file=sys.stderr)
        raise


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Generate chess move TTS clips via ElevenLabs"
    )
    parser.add_argument("--api-key", required=True, help="ElevenLabs API key")
    parser.add_argument("--voice", default=None, choices=list(VOICES.keys()),
                        help="Generate only this voice (default: both)")
    parser.add_argument("--lang", default=None,
                        help="Generate only this language (default: en)")
    parser.add_argument("--output", default="scripts/chess-clips",
                        help="Output directory (default: scripts/chess-clips)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Show what would be generated without calling API")
    parser.add_argument("--category", default=None,
                        help="Only generate this category (numbers, annotations, castling, moves)")
    parser.add_argument("--skip-existing", action="store_true", default=True,
                        help="Skip files that already exist (default: true)")
    parser.add_argument("--rate-limit", type=float, default=0.15,
                        help="Seconds between API calls (default: 0.15)")
    args = parser.parse_args()

    voice_keys = [args.voice] if args.voice else list(VOICES.keys())
    languages = [args.lang] if args.lang else ["en"]

    for voice_key in voice_keys:
        voice = VOICES[voice_key]
        for lang in languages:
            if lang not in CHESS_VOCAB:
                print(f"Unknown language: {lang}")
                continue

            phrases = generate_all_phrases(lang)

            # Filter by category if specified
            if args.category:
                phrases = [(c, f, t) for c, f, t in phrases if c == args.category]

            counts = count_phrases(phrases)
            total = len(phrases)

            print(f"\n{'='*60}")
            print(f"Voice: {voice['name']} | Language: {lang} | Total: {total} clips")
            print(f"{'='*60}")
            for cat, count in sorted(counts.items()):
                print(f"  {cat}: {count}")

            if args.dry_run:
                print(f"\nSample phrases:")
                for cat in sorted(counts.keys()):
                    samples = [(c, f, t) for c, f, t in phrases if c == cat][:3]
                    for c, f, t in samples:
                        print(f"  [{c}] {f}: \"{t}\"")
                    if counts[cat] > 3:
                        print(f"  ... and {counts[cat] - 3} more")
                continue

            # Generate
            out_dir = os.path.join(args.output, voice_key, lang)
            generated = 0
            skipped = 0
            errors = 0

            for i, (category, filename, text) in enumerate(phrases):
                cat_dir = os.path.join(out_dir, category)
                os.makedirs(cat_dir, exist_ok=True)

                filepath = os.path.join(cat_dir, f"{filename}.mp3")

                if args.skip_existing and os.path.exists(filepath):
                    skipped += 1
                    continue

                try:
                    print(f"  [{i+1}/{total}] {category}/{filename}: \"{text}\"")
                    audio = synthesize(text, voice["id"], args.api_key, lang)
                    with open(filepath, "wb") as f:
                        f.write(audio)
                    generated += 1

                    # Rate limiting
                    if args.rate_limit > 0:
                        time.sleep(args.rate_limit)

                except Exception as e:
                    print(f"    ERROR: {e}", file=sys.stderr)
                    errors += 1
                    if errors >= 5:
                        print("Too many errors, stopping.", file=sys.stderr)
                        break
                    time.sleep(2)  # Back off on error

            print(f"\nDone: {generated} generated, {skipped} skipped, {errors} errors")
            print(f"Output: {out_dir}")


if __name__ == "__main__":
    main()
