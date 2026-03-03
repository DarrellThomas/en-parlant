import { notifications } from "@mantine/notifications";
import { invoke } from "@tauri-apps/api/core";
import { fetch } from "@tauri-apps/plugin-http";
import { getDefaultStore } from "jotai";
import {
  ttsApiKeyAtom,
  ttsAutoNarrateAtom,
  ttsEnabledAtom,
  ttsGoogleApiKeyAtom,
  ttsGoogleGenderAtom,
  ttsKittenTTSThreadsAtom,
  ttsKittenTTSUrlAtom,
  ttsKittenTTSVoiceAtom,
  ttsLanguageAtom,
  ttsOpenTTSUrlAtom,
  ttsOpenTTSVoiceAtom,
  ttsProviderAtom,
  ttsSpeedAtom,
  ttsSystemVoiceAtom,
  ttsVoiceIdAtom,
  ttsVolumeAtom,
} from "@/state/atoms";
import { playCloudNarration, playDemoNarration } from "@/utils/cloudTts";
import type { GameHeaders, TreeNode } from "@/utils/treeReducer";

// Throttle TTS notifications so rapid navigation doesn't spam the user
let lastTtsNotification = 0;
function showTtsNotification(title: string, message: string) {
  const now = Date.now();
  if (now - lastTtsNotification < 5000) return;
  lastTtsNotification = now;
  notifications.show({ title, message, color: "yellow", autoClose: 8000 });
}

// --- Audio playback state ---

let currentAudio: HTMLAudioElement | null = null;
let currentAbort: AbortController | null = null;
let requestGeneration = 0;

// Cache: cacheKey -> blob URL (never revoked while in cache)
export const audioCache = new Map<string, string>();

/** Setter for currentAudio — allows cloudTts.ts to set the active audio element */
export function setCurrentAudio(audio: HTMLAudioElement | null) {
  currentAudio = audio;
}

/** Getter for requestGeneration — allows cloudTts.ts to check for interruption */
export function getRequestGeneration(): number {
  return requestGeneration;
}

// --- Multi-language chess vocabulary ---

interface ChessVocab {
  King: string;
  Queen: string;
  Rook: string;
  Bishop: string;
  Knight: string;
  castlesKingside: string;
  castlesQueenside: string;
  takes: string;
  check: string;
  checkmate: string;
  promotesTo: string;
  brilliant: string;
  good: string;
  interesting: string;
  dubious: string;
  mistake: string;
  blunder: string;
}

const CHESS_VOCAB: Record<string, ChessVocab> = {
  en: {
    King: "King",
    Queen: "Queen",
    Rook: "Rook",
    Bishop: "Bishop",
    Knight: "Knight",
    castlesKingside: "castles kingside",
    castlesQueenside: "castles queenside",
    takes: "takes",
    check: "check",
    checkmate: "checkmate",
    promotesTo: "promotes to",
    brilliant: "Brilliant move.",
    good: "Good move.",
    interesting: "Interesting move.",
    dubious: "Dubious move.",
    mistake: "Mistake.",
    blunder: "Blunder.",
  },
  fr: {
    King: "Roi",
    Queen: "Dame",
    Rook: "Tour",
    Bishop: "Fou",
    Knight: "Cavalier",
    castlesKingside: "petit roque",
    castlesQueenside: "grand roque",
    takes: "prend",
    check: "échec",
    checkmate: "échec et mat",
    promotesTo: "promu en",
    brilliant: "Coup brillant.",
    good: "Bon coup.",
    interesting: "Coup intéressant.",
    dubious: "Coup douteux.",
    mistake: "Erreur.",
    blunder: "Gaffe.",
  },
  es: {
    King: "Rey",
    Queen: "Dama",
    Rook: "Torre",
    Bishop: "Alfil",
    Knight: "Caballo",
    castlesKingside: "enroque corto",
    castlesQueenside: "enroque largo",
    takes: "captura",
    check: "jaque",
    checkmate: "jaque mate",
    promotesTo: "corona a",
    brilliant: "Jugada brillante.",
    good: "Buena jugada.",
    interesting: "Jugada interesante.",
    dubious: "Jugada dudosa.",
    mistake: "Error.",
    blunder: "Pifia.",
  },
  de: {
    King: "König",
    Queen: "Dame",
    Rook: "Turm",
    Bishop: "Läufer",
    Knight: "Springer",
    castlesKingside: "kurze Rochade",
    castlesQueenside: "lange Rochade",
    takes: "schlägt",
    check: "Schach",
    checkmate: "Schachmatt",
    promotesTo: "wandelt um in",
    brilliant: "Brillanter Zug.",
    good: "Guter Zug.",
    interesting: "Interessanter Zug.",
    dubious: "Zweifelhafter Zug.",
    mistake: "Fehler.",
    blunder: "Grober Fehler.",
  },
  ja: {
    King: "キング",
    Queen: "クイーン",
    Rook: "ルーク",
    Bishop: "ビショップ",
    Knight: "ナイト",
    castlesKingside: "キングサイドキャスリング",
    castlesQueenside: "クイーンサイドキャスリング",
    takes: "テイクス",
    check: "チェック",
    checkmate: "チェックメイト",
    promotesTo: "プロモーション",
    brilliant: "素晴らしい手。",
    good: "好手。",
    interesting: "興味深い手。",
    dubious: "疑問手。",
    mistake: "悪手。",
    blunder: "大悪手。",
  },
  ru: {
    King: "Король",
    Queen: "Ферзь",
    Rook: "Ладья",
    Bishop: "Слон",
    Knight: "Конь",
    castlesKingside: "рокировка на королевский фланг",
    castlesQueenside: "рокировка на ферзевый фланг",
    takes: "берёт",
    check: "шах",
    checkmate: "мат",
    promotesTo: "превращается в",
    brilliant: "Блестящий ход.",
    good: "Хороший ход.",
    interesting: "Интересный ход.",
    dubious: "Сомнительный ход.",
    mistake: "Ошибка.",
    blunder: "Грубая ошибка.",
  },
  zh: {
    King: "王",
    Queen: "后",
    Rook: "车",
    Bishop: "象",
    Knight: "马",
    castlesKingside: "王翼易位",
    castlesQueenside: "后翼易位",
    takes: "吃",
    check: "将军",
    checkmate: "将杀",
    promotesTo: "升变为",
    brilliant: "妙招。",
    good: "好棋。",
    interesting: "有趣的棋。",
    dubious: "可疑的棋。",
    mistake: "错着。",
    blunder: "漏着。",
  },
  ko: {
    King: "킹",
    Queen: "퀸",
    Rook: "룩",
    Bishop: "비숍",
    Knight: "나이트",
    castlesKingside: "킹사이드 캐슬링",
    castlesQueenside: "퀸사이드 캐슬링",
    takes: "잡음",
    check: "체크",
    checkmate: "체크메이트",
    promotesTo: "프로모션",
    brilliant: "brilliant한 수.",
    good: "좋은 수.",
    interesting: "흥미로운 수.",
    dubious: "의심스러운 수.",
    mistake: "실수.",
    blunder: "대실수.",
  },
  hi: {
    King: "राजा",
    Queen: "वज़ीर",
    Rook: "हाथी",
    Bishop: "ऊँट",
    Knight: "घोड़ा",
    castlesKingside: "किंगसाइड कैसलिंग",
    castlesQueenside: "क्वीनसाइड कैसलिंग",
    takes: "मारता है",
    check: "शह",
    checkmate: "शह और मात",
    promotesTo: "में बदलता है",
    brilliant: "शानदार चाल।",
    good: "अच्छी चाल।",
    interesting: "दिलचस्प चाल।",
    dubious: "संदिग्ध चाल।",
    mistake: "गलती।",
    blunder: "बड़ी गलती।",
  },
};

function getVocab(lang: string): ChessVocab {
  return CHESS_VOCAB[lang] || CHESS_VOCAB.en;
}

function getPieceNames(lang: string): Record<string, string> {
  const v = getVocab(lang);
  return { K: v.King, Q: v.Queen, R: v.Rook, B: v.Bishop, N: v.Knight };
}

function getAnnotationSpoken(lang: string): Record<string, string> {
  const v = getVocab(lang);
  return {
    "!!": v.brilliant,
    "!": v.good,
    "!?": v.interesting,
    "?!": v.dubious,
    "?": v.mistake,
    "??": v.blunder,
  };
}

// --- SAN to spoken (language-aware) ---

export function sanToSpoken(san: string, lang = "en"): string {
  if (!san) return "";

  const vocab = getVocab(lang);
  const pieceNames = getPieceNames(lang);

  // Castling
  if (san === "O-O" || san === "0-0") return vocab.castlesKingside;
  if (san === "O-O-O" || san === "0-0-0") return vocab.castlesQueenside;

  let spoken = san;

  // Strip check/checkmate symbols for separate handling
  const isCheckmate = spoken.endsWith("#");
  const isCheck = spoken.endsWith("+");
  spoken = spoken.replace(/[+#]$/, "");

  // Handle promotion: e.g. e8=Q -> e8 promotes to Queen
  const promoMatch = spoken.match(/^(.+)=([QRBN])$/);
  if (promoMatch) {
    const base = promoMatch[1];
    const promoPiece = pieceNames[promoMatch[2]] || promoMatch[2];
    spoken = `${sanMoveToSpoken(base, pieceNames, vocab)} ${vocab.promotesTo} ${promoPiece}`;
  } else {
    spoken = sanMoveToSpoken(spoken, pieceNames, vocab);
  }

  if (isCheckmate) spoken += `, ${vocab.checkmate}`;
  else if (isCheck) spoken += `, ${vocab.check}`;

  return spoken;
}

function sanMoveToSpoken(
  san: string,
  pieceNames: Record<string, string>,
  vocab: ChessVocab,
): string {
  // Piece moves: Nf3, Bxe6, Rae1, Qd1, etc.
  const pieceMatch = san.match(/^([KQRBN])([a-h]?[1-8]?)(x?)([a-h][1-8])$/);
  if (pieceMatch) {
    const piece = pieceNames[pieceMatch[1]] || pieceMatch[1];
    const disambig = pieceMatch[2]; // e.g. "a" in Rae1
    const captures = pieceMatch[3] === "x";
    const dest = pieceMatch[4];

    let result = piece;
    if (disambig) result += ` ${disambig}`;
    if (captures) result += ` ${vocab.takes}`;
    result += ` ${dest}`;
    return result;
  }

  // Pawn captures: exd5, dxe4
  const pawnCapture = san.match(/^([a-h])x([a-h][1-8])$/);
  if (pawnCapture) {
    return `${pawnCapture[1]} ${vocab.takes} ${pawnCapture[2]}`;
  }

  // Simple pawn move: e4, d5
  const pawnMove = san.match(/^([a-h][1-8])$/);
  if (pawnMove) {
    return pawnMove[1];
  }

  // Fallback: return as-is
  return san;
}

// --- Chess vocabulary for comment text ---

// Expand inline SAN notation that appears in comment text
// e.g. "7.Nf3 controls e5" -> "7. Knight f3 controls e5"
// e.g. "Bg3 stays active" -> "Bishop g3 stays active"
function expandInlineSAN(text: string, lang: string): string {
  // Move number + SAN: "7.Nf3" or "12.Bf5" or "28...Rxa8" or "5.Qxd8+"
  // Replace dots with comma so TTS doesn't say "dot"
  // Note: trailing (?!\w) instead of \b because +/# are non-word chars
  // and \b fails between two non-word chars (e.g. "+" followed by space)
  text = text.replace(
    /\b(\d+)(\.{1,3})([KQRBN]?[a-h]?x?[a-h][1-8](?:=[QRBN])?[+#]?)(?!\w)/g,
    (_match, num, _dots, san) => {
      return `${num}, ${sanToSpoken(san, lang)}`;
    },
  );

  // Standalone SAN at word boundary: "Bg3 stays active", "Nf3 controls", "Qxd8+ strips"
  // Must start with piece letter followed by file/rank
  text = text.replace(
    /\b([KQRBN][a-h]?x?[a-h][1-8][+#]?)(?!\w)/g,
    (_match, san) => sanToSpoken(san, lang),
  );

  return text;
}

// Chess terms that TTS engines mispronounce
function applyChessVocab(text: string, lang: string): string {
  const pieceNames = getPieceNames(lang);
  const vocab = getVocab(lang);

  // "en prise" - French pronunciation hint (only needed for English TTS)
  if (lang === "en") {
    text = text.replace(/\ben prise\b/gi, "on preez");
  }

  // Piece abbreviations in prose: "R vs R", "R+6P vs R+B+N+4P"
  text = text.replace(/\bR vs R\b/gi, `${pieceNames.R} versus ${pieceNames.R}`);
  text = text.replace(/\bR vs\b/gi, `${pieceNames.R} versus`);
  text = text.replace(/\bR\+/g, `${pieceNames.R} plus `);
  text = text.replace(/\bB\+/g, `${pieceNames.B} plus `);
  text = text.replace(/\bN\+/g, `${pieceNames.N} plus `);
  text = text.replace(/\bvs\b/gi, "versus");

  // Castling in prose
  text = text.replace(/\bO-O-O\b/g, vocab.castlesQueenside);
  text = text.replace(/\bO-O\b/g, vocab.castlesKingside);

  // Piece+square in prose: "Ra8 is hanging" -> "Rook on a8 is hanging"
  text = text.replace(
    /\b([KQRBN])([a-h][1-8])\s+(is|was|has|can|stays|controls|defends|attacks|guards|covers|on)\b/g,
    (_m: string, piece: string, sq: string, verb: string) =>
      `${pieceNames[piece] || piece} on ${sq} ${verb}`,
  );

  // Standalone "P" as pawns (careful - only when it looks like piece count)
  text = text.replace(/(\d)P\b/g, "$1 pawns");

  return text;
}

// --- Comment cleaning for TTS ---

export function cleanCommentForTTS(comment: string, lang = "en"): string {
  if (!comment) return "";

  let text = comment;

  // Strip PGN embedded tags: [%eval ...], [%csl ...], [%cal ...], [%clk ...]
  text = text.replace(/\[%(?:eval|csl|cal|clk)\s+[^\]]*\]/g, "");

  // Strip annotation symbols that might appear in text
  text = text.replace(/^(?:\?\?|\?!|!\?|!!|\?|!)\s*/g, "");

  // Strip leading quality words that duplicate annotation spoken form
  // e.g. when ?? annotation says "Blunder", strip "BLUNDER." from comment start
  text = text.replace(
    /^(?:BLUNDER|BRILLIANT|EXCELLENT|GOOD|MISTAKE|INACCURACY|DUBIOUS)[.!,:]?\s*/i,
    "",
  );

  // Expand inline SAN notation in comment text
  text = expandInlineSAN(text, lang);

  // Deduplicate repeated move numbers in lists
  // "6, Bishop f5, 6, Knight d7, or 6, Knight f6"
  // -> "6, Bishop f5, Knight d7, or Knight f6"
  const seenMoveNums = new Set<string>();
  text = text.replace(/(\d+),\s+/g, (match, num) => {
    if (seenMoveNums.has(num)) return "";
    seenMoveNums.add(num);
    return match;
  });

  // Strip any remaining dots in move numbers that weren't caught above
  // e.g. "6...a5" or "move 28..." -> replace dots with comma
  text = text.replace(/(\d+)(\.{1,3})/g, "$1,");

  // Apply chess vocabulary fixes
  text = applyChessVocab(text, lang);

  // Clean up multiple spaces and trim
  text = text.replace(/\s+/g, " ").trim();

  return text;
}

export function annotationsToSpoken(
  annotations: string[],
  lang = "en",
): string {
  const spoken = getAnnotationSpoken(lang);
  return annotations
    .map((a) => spoken[a] || "")
    .filter(Boolean)
    .join(" ");
}

// --- Build full narration for a move node ---

export function buildNarration(
  san: string | null,
  comment: string,
  annotations: string[],
  halfMoves: number,
  lang = "en",
): string {
  const parts: string[] = [];

  // Move number + move in spoken form
  if (san) {
    const moveNum = Math.ceil(halfMoves / 2);
    const movePrefix = `${moveNum}, `;
    parts.push(movePrefix + sanToSpoken(san, lang) + ".");
  }

  // Annotation quality assessment — add pause before praise/criticism
  const annoSpoken = annotationsToSpoken(annotations, lang);
  if (annoSpoken) parts.push(annoSpoken);

  // Comment text — separated by pause
  const cleanComment = cleanCommentForTTS(comment, lang);
  if (cleanComment) parts.push(cleanComment);

  // Join with pauses (period + space gives TTS a natural breath)
  return parts.join("  ");
}

// --- ElevenLabs API ---

const ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1/text-to-speech";
const DEFAULT_VOICE_ID = "pNInz6obpgDQGcFmaJgB"; // Adam

async function generateSpeech(
  text: string,
  apiKey: string,
  voiceId: string,
  lang = "en",
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  const body: Record<string, unknown> = {
    text,
    model_id: "eleven_turbo_v2_5",
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0.0,
      use_speaker_boost: true,
    },
  };

  // Add language_code for non-English to guide the TTS accent/pronunciation
  if (lang !== "en") {
    body.language_code = lang;
  }

  const response = await fetch(`${ELEVENLABS_API_URL}/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ElevenLabs API error ${response.status}: ${errorText}`);
  }

  return response.arrayBuffer();
}

// --- Google Cloud TTS API ---

const GOOGLE_TTS_URL = "https://texttospeech.googleapis.com/v1/text:synthesize";

type GoogleVoice = { languageCode: string; name: string };
const GOOGLE_VOICES: Record<string, Record<string, GoogleVoice>> = {
  en: {
    MALE: { languageCode: "en-US", name: "en-US-WaveNet-D" },
    FEMALE: { languageCode: "en-US", name: "en-US-WaveNet-F" },
  },
  fr: {
    MALE: { languageCode: "fr-FR", name: "fr-FR-WaveNet-G" },
    FEMALE: { languageCode: "fr-FR", name: "fr-FR-WaveNet-F" },
  },
  es: {
    MALE: { languageCode: "es-ES", name: "es-ES-WaveNet-E" },
    FEMALE: { languageCode: "es-ES", name: "es-ES-WaveNet-F" },
  },
  de: {
    MALE: { languageCode: "de-DE", name: "de-DE-WaveNet-H" },
    FEMALE: { languageCode: "de-DE", name: "de-DE-WaveNet-G" },
  },
  ja: {
    MALE: { languageCode: "ja-JP", name: "ja-JP-WaveNet-D" },
    FEMALE: { languageCode: "ja-JP", name: "ja-JP-WaveNet-A" },
  },
  ru: {
    MALE: { languageCode: "ru-RU", name: "ru-RU-WaveNet-B" },
    FEMALE: { languageCode: "ru-RU", name: "ru-RU-WaveNet-A" },
  },
  zh: {
    MALE: { languageCode: "cmn-CN", name: "cmn-CN-WaveNet-B" },
    FEMALE: { languageCode: "cmn-CN", name: "cmn-CN-WaveNet-A" },
  },
  ko: {
    MALE: { languageCode: "ko-KR", name: "ko-KR-WaveNet-C" },
    FEMALE: { languageCode: "ko-KR", name: "ko-KR-WaveNet-A" },
  },
};

function getGoogleVoice(lang: string, gender: string): GoogleVoice {
  const langVoices = GOOGLE_VOICES[lang] || GOOGLE_VOICES.en;
  return langVoices[gender] || langVoices.MALE;
}

async function generateSpeechGoogle(
  text: string,
  apiKey: string,
  lang = "en",
  gender = "MALE",
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  const voiceConfig = getGoogleVoice(lang, gender);

  const response = await fetch(`${GOOGLE_TTS_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input: { text },
      voice: {
        languageCode: voiceConfig.languageCode,
        name: voiceConfig.name,
        ssmlGender: gender,
      },
      audioConfig: { audioEncoding: "MP3" },
    }),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google TTS API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const binaryStr = atob(data.audioContent);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes.buffer;
}

// --- OpenTTS API ---

async function generateSpeechOpenTTS(
  text: string,
  serverUrl: string,
  voice: string,
  _lang = "en",
): Promise<ArrayBuffer> {
  const params = new URLSearchParams({ voice, text });
  const url = `${serverUrl}/api/tts?${params}`;

  const bytes: number[] = await invoke("fetch_tts_audio", { url });
  return new Uint8Array(bytes).buffer;
}

export interface OpenTTSVoice {
  id: string;
  name: string;
  gender: string;
  language: string;
  tts_name: string;
}

export async function listOpenTTSVoices(
  serverUrl: string,
  language?: string,
): Promise<OpenTTSVoice[]> {
  const params = new URLSearchParams();
  if (language) params.set("language", language);

  const url = `${serverUrl}/api/voices?${params}`;
  const bytes: number[] = await invoke("fetch_tts_audio", { url });
  const text = new TextDecoder().decode(new Uint8Array(bytes));
  const data = JSON.parse(text);
  return Object.entries(data).map(([key, val]: [string, any]) => ({
    id: key,
    name: val.name || key,
    gender: val.gender || "",
    language: val.language || "",
    tts_name: val.tts_name || "",
  }));
}

// --- KittenTTS API ---

async function generateSpeechKittenTTS(
  text: string,
  serverUrl: string,
  voice: string,
): Promise<ArrayBuffer> {
  const params = new URLSearchParams({ text, voice });
  const url = `${serverUrl}/api/tts?${params}`;

  const bytes: number[] = await invoke("fetch_tts_audio", { url });
  return new Uint8Array(bytes).buffer;
}

export const KITTENTTS_VOICES = [
  { id: "expr-voice-2-m", label: "Voice 2 (Male)" },
  { id: "expr-voice-2-f", label: "Voice 2 (Female)" },
  { id: "expr-voice-3-m", label: "Voice 3 (Male)" },
  { id: "expr-voice-3-f", label: "Voice 3 (Female)" },
  { id: "expr-voice-4-m", label: "Voice 4 (Male)" },
  { id: "expr-voice-4-f", label: "Voice 4 (Female)" },
  { id: "expr-voice-5-m", label: "Voice 5 (Male)" },
  { id: "expr-voice-5-f", label: "Voice 5 (Female)" },
];

// --- System TTS (native OS) ---

export interface SystemVoice {
  id: string;
  name: string;
  language: string;
}

export async function listSystemVoices(): Promise<SystemVoice[]> {
  return invoke<SystemVoice[]>("system_tts_list_voices");
}

async function speakSystemTTS(
  text: string,
  voiceId: string,
  rate: number,
  volume: number,
): Promise<void> {
  if (voiceId) {
    await invoke("system_tts_set_voice", { voiceId });
  }
  await invoke("system_tts_speak", {
    text,
    rate, // normalized: 0.5-2.0, 1.0 = normal (Rust maps to platform range)
    volume, // normalized: 0.0-1.0 (Rust maps to platform range)
    pitch: null,
  });
}

export async function stopSystemTTS(): Promise<void> {
  await invoke("system_tts_stop");
}

// --- KittenTTS auto-start ---

// Tracks whether the server is confirmed running (health check passed).
// Reset to false on failure so subsequent calls can retry.
let kittenTTSServerConfirmed = false;
let kittenTTSStartInProgress = false;

async function ensureKittenTTSRunning(): Promise<boolean> {
  // Already confirmed running — just verify with a quick health check
  if (kittenTTSServerConfirmed) {
    try {
      const store = getDefaultStore();
      const serverUrl =
        store.get(ttsKittenTTSUrlAtom) || "http://localhost:8192";
      const bytes: number[] = await invoke("fetch_tts_audio", {
        url: `${serverUrl}/api/voices`,
      });
      if (bytes.length > 0) return true;
    } catch {
      // Server died — reset and fall through to restart
      kittenTTSServerConfirmed = false;
    }
  }

  // Prevent concurrent start attempts
  if (kittenTTSStartInProgress) return false;
  kittenTTSStartInProgress = true;

  try {
    return await startKittenTTSServer();
  } finally {
    kittenTTSStartInProgress = false;
  }
}

async function startKittenTTSServer(): Promise<boolean> {
  const store = getDefaultStore();
  const serverUrl = store.get(ttsKittenTTSUrlAtom) || "http://localhost:8192";

  // Health check: is the server already running?
  try {
    const bytes: number[] = await invoke("fetch_tts_audio", {
      url: `${serverUrl}/api/voices`,
    });
    if (bytes.length > 0) {
      kittenTTSServerConfirmed = true;
      return true;
    }
  } catch {
    // Server not running — check deps and try to start it
  }

  // Check if dependencies are installed; auto-install if missing
  try {
    const [venv, packages] = await Promise.all([
      invoke<{ ok: boolean }>("check_kittentts_venv"),
      invoke<{ ok: boolean }>("check_kittentts_packages"),
    ]);

    if (!venv.ok || !packages.ok) {
      showTtsNotification(
        "Setting up KittenTTS",
        "Installing dependencies for the first time. This may take a minute...",
      );
      try {
        await invoke("setup_kittentts_venv");
      } catch (e) {
        console.error("KittenTTS auto-setup failed:", e);
        showTtsNotification(
          "KittenTTS setup failed",
          "Open Settings > Sound for the setup guide, or switch to System TTS.",
        );
        return false;
      }
    }
  } catch (e) {
    console.error("KittenTTS dependency check failed:", e);
  }

  try {
    const threads = store.get(ttsKittenTTSThreadsAtom) || null;
    await invoke("kittentts_start", { threads });
  } catch (e) {
    console.error("Failed to auto-start KittenTTS:", e);
    showTtsNotification(
      "KittenTTS could not start",
      "Open Settings > Sound to set up KittenTTS, or switch to System TTS.",
    );
    return false;
  }

  // Poll until server responds (up to 30s — model load can be slow)
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      const bytes: number[] = await invoke("fetch_tts_audio", {
        url: `${serverUrl}/api/voices`,
      });
      if (bytes.length > 0) {
        kittenTTSServerConfirmed = true;
        return true;
      }
    } catch {
      // keep waiting
    }
  }

  showTtsNotification(
    "KittenTTS is taking too long to start",
    "The server may still be loading the model. Try again in a moment, or switch to System TTS.",
  );
  return false;
}

// --- Public API ---

export function stopSpeaking() {
  // Abort any in-flight API request
  if (currentAbort) {
    currentAbort.abort();
    currentAbort = null;
  }
  // Bump generation so any pending responses are discarded
  requestGeneration++;
  // Stop any playing audio
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
  // Stop system TTS if active
  stopSystemTTS().catch(() => {});
  // Note: we do NOT revoke blob URLs here — they stay in audioCache for replay
}

export async function speakText(text: string): Promise<void> {
  const store = getDefaultStore();
  const provider = store.get(ttsProviderAtom) || "cloud";
  const volume = store.get(ttsVolumeAtom);
  const speed = store.get(ttsSpeedAtom);
  const lang = store.get(ttsLanguageAtom) || "en";

  if (!text.trim()) return;

  // Cloud provider can't speak arbitrary text — silently return
  if (provider === "cloud") return;

  // System TTS uses native OS engine via Tauri commands — separate path
  if (provider === "system") {
    stopSpeaking();
    const systemVoice = store.get(ttsSystemVoiceAtom) || "";
    try {
      await speakSystemTTS(text, systemVoice, speed, volume);
    } catch (e) {
      console.error("System TTS error:", e);
    }
    return;
  }

  let apiKey = "";
  let voiceId: string;
  let openTTSUrl = "";
  let kittenTTSUrl = "";

  let gender = "MALE";
  if (provider === "kittentts") {
    // Auto-start the server if not running
    const serverReady = await ensureKittenTTSRunning();
    if (!serverReady) return;
    kittenTTSUrl = store.get(ttsKittenTTSUrlAtom) || "http://localhost:8192";
    voiceId = store.get(ttsKittenTTSVoiceAtom) || "expr-voice-2-m";
  } else if (provider === "opentts") {
    openTTSUrl = store.get(ttsOpenTTSUrlAtom) || "http://localhost:5500";
    voiceId = store.get(ttsOpenTTSVoiceAtom) || "";
    if (!voiceId) {
      showTtsNotification(
        "OpenTTS: No voice selected",
        "Go to Settings > Sound and select a voice for OpenTTS.",
      );
      return;
    }
  } else if (provider === "google") {
    apiKey = store.get(ttsGoogleApiKeyAtom);
    gender = store.get(ttsGoogleGenderAtom) || "MALE";
    voiceId = getGoogleVoice(lang, gender).name;
    if (!apiKey) {
      showTtsNotification(
        "Google Cloud TTS: API key required",
        "Go to Settings > Sound and enter your Google Cloud API key.",
      );
      return;
    }
  } else {
    apiKey = store.get(ttsApiKeyAtom);
    voiceId = store.get(ttsVoiceIdAtom) || DEFAULT_VOICE_ID;
    if (!apiKey) {
      showTtsNotification(
        "ElevenLabs: API key required",
        "Go to Settings > Sound and enter your ElevenLabs API key.",
      );
      return;
    }
  }

  // Stop any currently playing audio and cancel in-flight requests
  stopSpeaking();

  // Tag this request with a generation number so stale responses are discarded
  const thisGeneration = ++requestGeneration;
  const abort = new AbortController();
  currentAbort = abort;

  // Timeout for cloud providers — don't hang forever on bad networks
  const isLocalServer = provider === "kittentts" || provider === "opentts";
  const isCloudProvider = provider === "elevenlabs" || provider === "google";
  let timeout: ReturnType<typeof setTimeout> | null = null;
  if (isCloudProvider) {
    timeout = setTimeout(() => abort.abort(), 15000);
  }
  const maxAttempts = isLocalServer ? 2 : 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Include provider + voice + language in cache key
      const cacheKey = `${provider}:${voiceId}:${lang}:${text}`;
      let blobUrl = audioCache.get(cacheKey);

      if (!blobUrl) {
        let audioData: ArrayBuffer;
        let mimeType = "audio/mpeg";
        if (provider === "kittentts") {
          audioData = await generateSpeechKittenTTS(
            text,
            kittenTTSUrl,
            voiceId,
          );
          mimeType = "audio/wav";
        } else if (provider === "opentts") {
          audioData = await generateSpeechOpenTTS(
            text,
            openTTSUrl,
            voiceId,
            lang,
          );
          mimeType = "audio/wav";
        } else if (provider === "google") {
          audioData = await generateSpeechGoogle(
            text,
            apiKey,
            lang,
            gender,
            abort.signal,
          );
        } else {
          audioData = await generateSpeech(
            text,
            apiKey,
            voiceId,
            lang,
            abort.signal,
          );
        }
        if (thisGeneration !== requestGeneration) return;

        const blob = new Blob([audioData], { type: mimeType });
        blobUrl = URL.createObjectURL(blob);
        audioCache.set(cacheKey, blobUrl);
      }

      if (thisGeneration !== requestGeneration) return;

      currentAudio = new Audio(blobUrl);
      currentAudio.volume = volume;
      currentAudio.playbackRate = speed;
      await currentAudio.play();
      if (timeout) clearTimeout(timeout);
      return; // success — exit retry loop
    } catch (e) {
      if (timeout) clearTimeout(timeout);
      if (e instanceof DOMException && e.name === "AbortError") return;
      if (attempt < maxAttempts) {
        // Server may still be starting — wait and retry
        console.log(`TTS attempt ${attempt} failed, retrying in 2s...`);
        await new Promise((r) => setTimeout(r, 2000));
        if (thisGeneration !== requestGeneration) return;
        continue;
      }
      console.error("TTS error:", e);
      if (isLocalServer) {
        showTtsNotification(
          `${provider === "kittentts" ? "KittenTTS" : "OpenTTS"} server not responding`,
          "Start the server from Settings > Sound, or switch to a different provider.",
        );
      } else if (provider === "system") {
        showTtsNotification(
          "System TTS failed",
          String(e).includes("initialize")
            ? "Your OS speech system could not be initialized. On Linux, install speech-dispatcher."
            : `System TTS error: ${e}`,
        );
      } else if (isCloudProvider) {
        const msg = String(e);
        showTtsNotification(
          `${provider === "google" ? "Google Cloud" : "ElevenLabs"} TTS failed`,
          msg.includes("abort") || msg.includes("timeout")
            ? "Request timed out. Check your internet connection."
            : msg,
        );
      }
    }
  }
}

export async function speakComment(
  comment: string,
  headers?: GameHeaders,
): Promise<void> {
  // Demo mode — play intro clip (halfMoves=0)
  if (headers?.other?.AudioSource === "demo" && headers?.other?.Language) {
    await playDemoNarration(0, headers.other.Language, headers.other.AudioGender);
    return;
  }

  const store = getDefaultStore();
  const provider = store.get(ttsProviderAtom) || "cloud";
  // Cloud provider can't speak arbitrary comment text
  if (provider === "cloud") return;
  const lang = store.get(ttsLanguageAtom) || "en";
  const cleaned = cleanCommentForTTS(comment, lang);
  if (cleaned) {
    await speakText(cleaned);
  }
}

export async function speakMoveNarration(
  san: string | null,
  comment: string,
  annotations: string[],
  halfMoves: number,
  headers?: GameHeaders,
): Promise<void> {
  // Demo mode — works regardless of provider setting
  if (headers?.other?.AudioSource === "demo" && headers?.other?.Language) {
    await playDemoNarration(halfMoves, headers.other.Language, headers.other.AudioGender);
    return;
  }

  const store = getDefaultStore();
  const provider = store.get(ttsProviderAtom) || "cloud";

  // Cloud provider works directly with SAN + annotations (no text assembly needed)
  if (provider === "cloud") {
    await playCloudNarration(san, comment, annotations, halfMoves);
    return;
  }

  // All other providers: build narration text and speak it
  const lang = store.get(ttsLanguageAtom) || "en";
  const narration = buildNarration(san, comment, annotations, halfMoves, lang);
  if (narration) {
    await speakText(narration);
  }
}

export function isTTSEnabled(): boolean {
  const store = getDefaultStore();
  return store.get(ttsEnabledAtom);
}

export function isAutoNarrateEnabled(): boolean {
  const store = getDefaultStore();
  return store.get(ttsEnabledAtom) && store.get(ttsAutoNarrateAtom);
}

// --- Precache ---

// Build narration text for a node (same as what would be spoken)
function narrationForNode(node: TreeNode, lang: string): string | null {
  if (!node.comment && node.annotations.length === 0) return null;
  return buildNarration(
    node.san,
    node.comment,
    node.annotations,
    node.halfMoves,
    lang,
  );
}

// Precache all narrations for a game tree in the background
// Fires API calls sequentially to avoid rate limiting
export async function precacheGame(root: TreeNode): Promise<number> {
  const store = getDefaultStore();
  const provider = store.get(ttsProviderAtom) || "cloud";
  const lang = store.get(ttsLanguageAtom) || "en";

  // Cloud clips are cached on R2 edge + locally on first fetch — no precaching needed
  if (provider === "cloud") return 0;
  // System TTS doesn't support precaching (speaks directly via OS)
  if (provider === "system") return 0;

  let apiKey = "";
  let voiceId: string;
  let gender = "MALE";
  let openTTSUrl = "";
  let kittenTTSUrl = "";

  if (provider === "kittentts") {
    kittenTTSUrl = store.get(ttsKittenTTSUrlAtom) || "http://localhost:8192";
    voiceId = store.get(ttsKittenTTSVoiceAtom) || "expr-voice-2-m";
  } else if (provider === "opentts") {
    openTTSUrl = store.get(ttsOpenTTSUrlAtom) || "http://localhost:5500";
    voiceId = store.get(ttsOpenTTSVoiceAtom) || "";
    if (!voiceId) return 0;
  } else if (provider === "google") {
    apiKey = store.get(ttsGoogleApiKeyAtom);
    gender = store.get(ttsGoogleGenderAtom) || "MALE";
    voiceId = getGoogleVoice(lang, gender).name;
    if (!apiKey) return 0;
  } else {
    apiKey = store.get(ttsApiKeyAtom);
    voiceId = store.get(ttsVoiceIdAtom) || DEFAULT_VOICE_ID;
    if (!apiKey) return 0;
  }

  // Collect all narration texts
  const texts: string[] = [];
  const queue: TreeNode[] = [root];
  while (queue.length > 0) {
    const node = queue.pop()!;
    const narration = narrationForNode(node, lang);
    if (narration) {
      const cacheKey = `${provider}:${voiceId}:${lang}:${narration}`;
      if (!audioCache.has(cacheKey)) {
        texts.push(narration);
      }
    }
    for (const child of node.children) {
      queue.push(child);
    }
  }

  if (texts.length === 0) return 0;

  console.log(`TTS precaching ${texts.length} annotations...`);

  let cached = 0;
  for (const text of texts) {
    const cacheKey = `${provider}:${voiceId}:${lang}:${text}`;
    if (audioCache.has(cacheKey)) continue; // double-check

    try {
      let audioData: ArrayBuffer;
      let mimeType = "audio/mpeg";
      if (provider === "kittentts") {
        audioData = await generateSpeechKittenTTS(text, kittenTTSUrl, voiceId);
        mimeType = "audio/wav";
      } else if (provider === "opentts") {
        audioData = await generateSpeechOpenTTS(
          text,
          openTTSUrl,
          voiceId,
          lang,
        );
        mimeType = "audio/wav";
      } else if (provider === "google") {
        audioData = await generateSpeechGoogle(text, apiKey, lang, gender);
      } else {
        audioData = await generateSpeech(text, apiKey, voiceId, lang);
      }
      const blob = new Blob([audioData], { type: mimeType });
      const blobUrl = URL.createObjectURL(blob);
      audioCache.set(cacheKey, blobUrl);
      cached++;
    } catch (e) {
      console.error("TTS precache error:", e);
      break; // stop on error (rate limit, etc.)
    }
  }

  console.log(`TTS precached ${cached}/${texts.length} annotations`);
  return cached;
}

// --- Voice listing ---

export interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category: string;
}

export async function listVoices(apiKey: string): Promise<ElevenLabsVoice[]> {
  const response = await fetch("https://api.elevenlabs.io/v1/voices", {
    headers: { "xi-api-key": apiKey },
  });

  if (!response.ok) {
    throw new Error(`Failed to list voices: ${response.status}`);
  }

  const data = await response.json();
  return (data.voices || []).map((v: any) => ({
    voice_id: v.voice_id,
    name: v.name,
    category: v.category || "premade",
  }));
}

export function clearAudioCache() {
  for (const url of audioCache.values()) {
    URL.revokeObjectURL(url);
  }
  audioCache.clear();
}
