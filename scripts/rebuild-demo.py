#!/usr/bin/env python3
"""
Parse a commented English PGN, translate to 8 languages via Claude API,
generate PGN files and narration text for all 9 languages.

Output PGN files (docs/demos/tts-demo-*.pgn) and narration text files are
written locally but are NOT bundled with the app. rebuild-demo.sh uploads
them to R2 (enparlant-assets/pgn/demo/ and enparlant-assets/audio/demo/)
where the app fetches them at runtime.

Usage:
    python3 scripts/rebuild-demo.py \
        --pgn docs/demos/game.pgn \
        --anthropic-key KEY \
        --output-dir docs/demos

Requires: pip install anthropic chess
"""

import argparse
import json
import os
import re
import sys

try:
    import anthropic
except ImportError:
    sys.exit("Error: 'anthropic' package not found. Run: pip install anthropic")

try:
    import chess
    import chess.pgn
except ImportError:
    sys.exit("Error: 'chess' package not found. Run: pip install chess")


# ─── Languages ────────────────────────────────────────────────────────────────

LANGUAGES = ["en", "fr", "de", "es", "ja", "ru", "zh", "ko", "hi"]

LANG_NAMES = {
    "en": "English",
    "fr": "French",
    "de": "German",
    "es": "Spanish",
    "ja": "Japanese",
    "ru": "Russian",
    "zh": "Chinese (Mandarin)",
    "ko": "Korean",
    "hi": "Hindi",
}

# ─── Chess vocabulary per language ────────────────────────────────────────────
# Source: scripts/generate-chess-clips.py with Hindi added.

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
    "hi": {
        "King": "राजा", "Queen": "वज़ीर", "Rook": "हाथी",
        "Bishop": "ऊँट", "Knight": "घोड़ा",
        "castlesKingside": "किंगसाइड कैसलिंग",
        "castlesQueenside": "क्वीनसाइड कैसलिंग",
        "takes": "लेता है", "check": "शह", "checkmate": "शह और मात",
        "promotesTo": "प्रमोशन",
        "brilliant": "शानदार चाल।",
        "good": "अच्छी चाल।",
        "interesting": "दिलचस्प चाल।",
        "dubious": "संदिग्ध चाल।",
        "mistake": "गलती।",
        "blunder": "बड़ी गलती।",
    },
}

# ─── NAG mappings ─────────────────────────────────────────────────────────────

NAG_SYMBOLS = {1: "!", 2: "?", 3: "!!", 4: "??", 5: "!?", 6: "?!"}
NAG_ANNOTATIONS = {
    1: "good", 2: "mistake", 3: "brilliant",
    4: "blunder", 5: "interesting", 6: "dubious",
}


# ─── Helpers ──────────────────────────────────────────────────────────────────

def split_markup(comment):
    """Split [%cal ...] and [%csl ...] board markup from comment text.

    Returns (markup_string, clean_text). Markup appears at the start of
    PGN comments and must be preserved verbatim in the PGN output but
    stripped from narration text.
    """
    markup_parts = []
    text = comment
    while True:
        m = re.match(r'\s*(\[%(?:cal|csl)\s+[^\]]+\])\s*', text)
        if m:
            markup_parts.append(m.group(1))
            text = text[m.end():]
        else:
            break
    markup = " ".join(markup_parts)
    return markup, text.strip()


def san_to_spoken(san, lang):
    """Convert SAN notation to spoken text in the given language.

    Examples (English):
        Nxe4  -> Knight takes e4
        Qf3   -> Queen f3
        O-O-O -> castles queenside
        Qd8#  -> Queen d8, checkmate
        e8=Q  -> e8 promotes to Queen
        dxe4  -> d takes e4
    """
    v = CHESS_VOCAB[lang]

    # Strip check/checkmate suffix
    suffix = ""
    if san.endswith("#"):
        suffix = f", {v['checkmate']}"
        clean = san[:-1]
    elif san.endswith("+"):
        suffix = f", {v['check']}"
        clean = san[:-1]
    else:
        clean = san

    # Castling
    if clean == "O-O":
        return v["castlesKingside"] + suffix
    if clean == "O-O-O":
        return v["castlesQueenside"] + suffix

    # Promotion (e.g. e8=Q, exd8=Q)
    promotion = ""
    if "=" in clean:
        clean, promo_char = clean.split("=", 1)
        piece_map = {"Q": "Queen", "R": "Rook", "B": "Bishop", "N": "Knight"}
        if promo_char in piece_map:
            promotion = f" {v['promotesTo']} {v[piece_map[promo_char]]}"

    captures = "x" in clean
    no_x = clean.replace("x", "")

    piece_chars = {"K": "King", "Q": "Queen", "R": "Rook", "B": "Bishop", "N": "Knight"}

    if no_x and no_x[0] in piece_chars:
        # Piece move (e.g. Nxe4, Qf3, Rad1)
        piece = v[piece_chars[no_x[0]]]
        dest = no_x[-2:]  # destination square is always last 2 chars
        if captures:
            return f"{piece} {v['takes']} {dest}" + promotion + suffix
        else:
            return f"{piece} {dest}" + promotion + suffix
    else:
        # Pawn move (e.g. e4, dxe4, e8=Q)
        if captures:
            src_file = no_x[0]
            dest = no_x[-2:]
            return f"{src_file} {v['takes']} {dest}" + promotion + suffix
        else:
            dest = no_x[-2:]
            return dest + promotion + suffix


# ─── PGN parsing ──────────────────────────────────────────────────────────────

def parse_pgn(pgn_path):
    """Parse PGN file and return structured data.

    Returns:
        headers: list of (key, value) tuples in original order
        result:  game result string (e.g. "1-0")
        root_comment: comment before the first move
        moves: list of dicts with keys:
            halfmove, san, nag_suffix, annotation_key, comment
    """
    # First pass: record which header keys are actually in the file,
    # since python-chess auto-adds Seven Tag Roster defaults like [Site "?"].
    original_keys = set()
    with open(pgn_path) as f:
        for line in f:
            line = line.strip()
            if not line:
                break
            m = re.match(r'\[(\w+)\s', line)
            if m:
                original_keys.add(m.group(1))

    with open(pgn_path) as f:
        game = chess.pgn.read_game(f)
    if game is None:
        sys.exit(f"Error: could not parse PGN from {pgn_path}")

    headers = [(k, v) for k, v in game.headers.items() if k in original_keys]
    result = game.headers.get("Result", "*")
    root_comment = game.comment or ""

    moves = []
    halfmove = 0
    for node in game.mainline():
        halfmove += 1
        san = node.san()
        nag_suffix = ""
        annotation_key = None
        for nag in sorted(node.nags):
            if nag in NAG_SYMBOLS:
                nag_suffix = NAG_SYMBOLS[nag]
            if nag in NAG_ANNOTATIONS:
                annotation_key = NAG_ANNOTATIONS[nag]
        moves.append({
            "halfmove": halfmove,
            "san": san,
            "nag_suffix": nag_suffix,
            "annotation_key": annotation_key,
            "comment": node.comment or "",
        })

    return headers, result, root_comment, moves


# ─── PGN generation ───────────────────────────────────────────────────────────

def generate_pgn(headers, root_comment, moves, result):
    """Generate a PGN string from structured data."""
    lines = []
    for key, value in headers:
        lines.append(f'[{key} "{value}"]')
    lines.append("")

    if root_comment:
        lines.append(f"{{{root_comment}}}")

    parts = []
    for mv in moves:
        hm = mv["halfmove"]
        move_num = (hm + 1) // 2
        is_white = hm % 2 == 1
        san_with_nag = mv["san"] + mv["nag_suffix"]

        if is_white:
            parts.append(f"{move_num}. {san_with_nag}")
        else:
            parts.append(san_with_nag)

        if mv["comment"]:
            parts.append(f"{{{mv['comment']}}}")

    parts.append(result)
    lines.append(" ".join(parts))
    lines.append("")
    return "\n".join(lines)


# ─── Narration text generation ────────────────────────────────────────────────

def generate_narration(root_comment, moves, lang):
    """Generate narration text for each commented move.

    Returns dict mapping halfmove number to narration text string.

    Format:
        move-0:  {clean_comment_text}
        move-N:  {moveNum}, {spokenMove}.  {annotation}.  {comment}
                 (annotation only if NAG present)
    """
    v = CHESS_VOCAB[lang]
    narration = {}

    if root_comment:
        _, clean = split_markup(root_comment)
        narration[0] = clean

    for mv in moves:
        if not mv["comment"]:
            continue

        _, clean = split_markup(mv["comment"])
        hm = mv["halfmove"]
        move_num = (hm + 1) // 2
        spoken = san_to_spoken(mv["san"], lang)

        text = f"{move_num}, {spoken}."
        if mv["annotation_key"] and mv["annotation_key"] in v:
            text += f"  {v[mv['annotation_key']]}"
        text += f"  {clean}"

        narration[hm] = text

    return narration


# ─── Claude API translation ──────────────────────────────────────────────────

def translate_batch(client, texts_by_key, target_lang, lang_name):
    """Translate a dict of {key: english_text} via Claude API.

    Returns {key: translated_text}.
    Raises RuntimeError if the response cannot be parsed or keys are missing.
    """
    if not texts_by_key:
        return {}

    input_json = json.dumps(texts_by_key, ensure_ascii=False, indent=2)

    prompt = f"""You are translating chess commentary from English to {lang_name}.

Rules:
- Translate ONLY the natural language text
- Preserve [%cal ...] and [%csl ...] markup exactly as-is
- Preserve algebraic notation (e4, Nf3, O-O, etc.) exactly
- Use standard chess terminology for the target language
- Keep the same tone (casual, instructive)
- Return ONLY a JSON object with the same keys and translated values, no other text

Input:
{input_json}"""

    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=8192,
        messages=[{"role": "user", "content": prompt}],
    )

    response_text = response.content[0].text.strip()

    # Strip markdown code fence if Claude wraps the response
    if response_text.startswith("```"):
        response_text = re.sub(r"^```\w*\n?", "", response_text)
        response_text = re.sub(r"\n?```\s*$", "", response_text.strip())

    try:
        result = json.loads(response_text)
    except json.JSONDecodeError as e:
        raise RuntimeError(
            f"Translation response for {lang_name} is not valid JSON: {e}\n"
            f"Response was: {response_text[:300]}"
        )

    missing = set(texts_by_key.keys()) - set(result.keys())
    if missing:
        raise RuntimeError(
            f"Translation response for {lang_name} is missing keys: {missing}"
        )

    return result


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Translate demo PGN and generate narration text for all languages"
    )
    parser.add_argument("--pgn", required=True, help="Input English PGN file")
    parser.add_argument("--anthropic-key", required=True, help="Anthropic API key")
    parser.add_argument("--output-dir", default="docs/demos",
                        help="Output directory (default: docs/demos)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Parse PGN and show plan without making API calls")
    args = parser.parse_args()

    # ── Parse PGN ──
    print(f"Parsing PGN: {args.pgn}")
    headers, result, root_comment, moves = parse_pgn(args.pgn)

    commented = [m for m in moves if m["comment"]]
    print(f"  {len(moves)} halfmoves, {len(commented)} with comments")

    # ── Collect texts to translate ──
    texts = {}  # key -> english text

    if root_comment:
        _, root_text = split_markup(root_comment)
        texts["root"] = root_text

    for key, value in headers:
        if key == "Event":
            texts["event"] = value
        elif key == "Termination":
            texts["termination"] = value

    for mv in moves:
        if mv["comment"]:
            _, clean = split_markup(mv["comment"])
            texts[f"m{mv['halfmove']}"] = clean

    print(f"  {len(texts)} text items to translate per language")

    if args.dry_run:
        print("\nDry run — texts that would be translated:")
        for key in sorted(texts.keys()):
            preview = texts[key][:80]
            if len(texts[key]) > 80:
                preview += "..."
            print(f"  {key}: {preview}")

        print("\nNarration preview (English):")
        narr = generate_narration(root_comment, moves, "en")
        for hm in sorted(narr.keys()):
            print(f"  move-{hm}.txt: {narr[hm][:80]}...")
        return

    # ── Initialize Claude client ──
    client = anthropic.Anthropic(api_key=args.anthropic_key)

    os.makedirs(args.output_dir, exist_ok=True)

    # ── Process each language ──
    succeeded = []
    failed = {}  # lang -> error message

    for lang in LANGUAGES:
        print(f"\n{'='*60}")
        print(f"  {lang} — {LANG_NAMES[lang]}")
        print(f"{'='*60}")

        try:
            if lang == "en":
                translated = dict(texts)
            else:
                print(f"  Translating {len(texts)} items via Claude API...")
                translated = translate_batch(client, texts, lang, LANG_NAMES[lang])
                print(f"  Received {len(translated)} translations")

            # ── Build headers ──
            lang_headers = []
            has_audio_source = False
            has_language = False
            for key, value in headers:
                if key == "Event" and "event" in translated:
                    lang_headers.append((key, translated["event"]))
                elif key == "Termination" and "termination" in translated:
                    lang_headers.append((key, translated["termination"]))
                elif key == "Language":
                    lang_headers.append((key, lang))
                    has_language = True
                elif key == "AudioSource":
                    lang_headers.append((key, "demo"))
                    has_audio_source = True
                else:
                    lang_headers.append((key, value))
            if not has_audio_source:
                lang_headers.append(("AudioSource", "demo"))
            if not has_language:
                lang_headers.append(("Language", lang))

            # ── Build moves with translated comments ──
            lang_moves = []
            for mv in moves:
                new_mv = dict(mv)
                if mv["comment"]:
                    markup, _ = split_markup(mv["comment"])
                    key = f"m{mv['halfmove']}"
                    trans = translated.get(key, texts.get(key, ""))
                    new_mv["comment"] = f"{markup} {trans}" if markup else trans
                lang_moves.append(new_mv)

            # ── Build root comment ──
            lang_root = ""
            if root_comment:
                markup, _ = split_markup(root_comment)
                trans_root = translated.get("root", texts.get("root", ""))
                lang_root = f"{markup} {trans_root}" if markup else trans_root

            # ── Write PGN ──
            pgn_str = generate_pgn(lang_headers, lang_root, lang_moves, result)
            pgn_path = os.path.join(args.output_dir, f"tts-demo-{lang}.pgn")
            with open(pgn_path, "w") as f:
                f.write(pgn_str)
            print(f"  PGN:       {pgn_path}")

            # ── Write narration text ──
            narr = generate_narration(lang_root, lang_moves, lang)
            narr_dir = os.path.join(args.output_dir, "narration", lang)
            os.makedirs(narr_dir, exist_ok=True)

            # Remove old narration text files (but not audio/)
            for fname in os.listdir(narr_dir):
                if fname.startswith("move-") and fname.endswith(".txt"):
                    os.remove(os.path.join(narr_dir, fname))

            for hm, text in narr.items():
                txt_path = os.path.join(narr_dir, f"move-{hm}.txt")
                with open(txt_path, "w") as f:
                    f.write(text + "\n")

            print(f"  Narration: {len(narr)} files in {narr_dir}")
            succeeded.append(lang)

        except Exception as e:
            print(f"  ERROR: {e}")
            failed[lang] = str(e)

    # ── Summary ──
    print(f"\n{'='*60}")
    print(f"  Summary")
    print(f"{'='*60}")
    for lang in succeeded:
        print(f"  OK   {lang} — {LANG_NAMES[lang]}")
    for lang, err in failed.items():
        print(f"  FAIL {lang} — {LANG_NAMES[lang]}: {err}")
    print(f"\n  {len(succeeded)} succeeded, {len(failed)} failed.")

    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
