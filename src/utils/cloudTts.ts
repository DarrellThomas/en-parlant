import { notifications } from "@mantine/notifications";
import { fetch } from "@tauri-apps/plugin-http";
import { getDefaultStore } from "jotai";
import { ttsSpeedAtom, ttsVolumeAtom } from "@/state/atoms";
import type { TreeNode } from "./treeReducer";
import { audioCache, getRequestGeneration, setCurrentAudio } from "./tts";

const CLOUD_BASE_URL = "https://enparlant.redshed.ai/audio";

const PIECE_NAMES: Record<string, string> = {
  K: "king",
  Q: "queen",
  R: "rook",
  B: "bishop",
  N: "knight",
};

const PROMOTION_PIECES: Record<string, string> = {
  Q: "queen",
  R: "rook",
  B: "bishop",
  N: "knight",
};

const ANNOTATION_CLIPS: Record<string, string> = {
  "!!": "annotations/brilliant",
  "!": "annotations/good",
  "!?": "annotations/interesting",
  "?!": "annotations/dubious",
  "?": "annotations/mistake",
  "??": "annotations/blunder",
};

/**
 * Maps SAN notation directly to a clip path (relative to voice/lang directory).
 * NOT the same as sanToSpoken() — clip filenames follow their own naming convention.
 */
export function sanToClipPath(san: string): string {
  if (!san) return "";

  // Castling
  if (san === "O-O" || san === "0-0") return "castling/kingside";
  if (san === "O-O-O" || san === "0-0-0") return "castling/queenside";

  let s = san;

  // Strip and track check/checkmate suffix
  let suffix = "";
  if (s.endsWith("#")) {
    suffix = "-checkmate";
    s = s.slice(0, -1);
  } else if (s.endsWith("+")) {
    suffix = "-check";
    s = s.slice(0, -1);
  }

  // Strip and track promotion
  let promoSuffix = "";
  const promoMatch = s.match(/=([QRBN])$/);
  if (promoMatch) {
    promoSuffix = `-promotes-to-${PROMOTION_PIECES[promoMatch[1]]}`;
    s = s.slice(0, -2); // remove =X
  }

  // Determine piece
  let piece: string;
  if ("KQRBN".includes(s[0])) {
    piece = PIECE_NAMES[s[0]];
    s = s.slice(1);
  } else {
    piece = "pawn";
  }

  // Detect capture
  const hasCapture = s.includes("x");
  s = s.replace("x", "");

  // What remains is [disambig][dest]
  // dest is always file+rank (2 chars) at the end
  // disambig is 0-2 chars before dest
  let disambig = "";
  let dest = s;
  if (s.length > 2) {
    disambig = s.slice(0, s.length - 2);
    dest = s.slice(s.length - 2);
  }

  // Build path parts
  const parts: string[] = [piece];
  if (disambig) parts.push(disambig);
  if (hasCapture) parts.push("takes");
  parts.push(dest);

  return `moves/${parts.join("-")}${promoSuffix}${suffix}`;
}

/**
 * Maps annotation symbols to clip paths.
 */
export function annotationToClipPath(annotation: string): string | null {
  return ANNOTATION_CLIPS[annotation] || null;
}

/**
 * Builds a full clip URL from voice, language, and clip path.
 */
function buildClipUrl(voice: string, lang: string, clipPath: string): string {
  return `${CLOUD_BASE_URL}/${voice}/${lang}/${clipPath}.mp3`;
}

/**
 * Fetches a clip from R2, caching as blob URL. Returns null on error.
 */
async function fetchClip(url: string): Promise<string | null> {
  const cacheKey = `cloud:${url}`;
  const cached = audioCache.get(cacheKey);
  if (cached) return cached;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`Cloud TTS: failed to fetch ${url} (${response.status})`);
      return null;
    }
    const arrayBuffer = await response.arrayBuffer();
    const blob = new Blob([arrayBuffer], { type: "audio/mpeg" });
    const blobUrl = URL.createObjectURL(blob);
    audioCache.set(cacheKey, blobUrl);
    return blobUrl;
  } catch (e) {
    console.warn(`Cloud TTS: fetch error for ${url}:`, e);
    return null;
  }
}

/**
 * Plays a single audio clip. Returns a promise that resolves when playback ends.
 * Sets currentAudio so stopSpeaking() can interrupt.
 */
function playClip(
  blobUrl: string,
  volume: number,
  speed: number,
): Promise<void> {
  return new Promise((resolve) => {
    const audio = new Audio(blobUrl);
    audio.volume = volume;
    audio.playbackRate = speed;
    setCurrentAudio(audio);
    audio.onended = () => resolve();
    audio.onerror = () => {
      console.warn("Cloud TTS: playback error");
      resolve(); // don't break the chain
    };
    audio.play().catch((e) => {
      // AbortError is normal when interrupted
      if (e instanceof DOMException && e.name === "AbortError") {
        resolve();
      } else {
        console.warn("Cloud TTS: play error:", e);
        resolve();
      }
    });
  });
}

/**
 * Delays for a given number of milliseconds.
 */
function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Main entry point: plays cloud narration for a move.
 * Called from speakMoveNarration() when provider is "cloud".
 */
export async function playCloudNarration(
  san: string | null,
  _comment: string,
  annotations: string[],
  halfMoves: number,
): Promise<void> {
  const store = getDefaultStore();
  const volume = store.get(ttsVolumeAtom);
  const speed = store.get(ttsSpeedAtom);
  const generation = getRequestGeneration();

  const voice = "daniel";
  const lang = "en";

  // Build list of clip URLs to play
  const clipUrls: { url: string; pauseAfter: number }[] = [];

  if (san) {
    // Move number clip
    const moveNum = Math.ceil(halfMoves / 2);
    if (moveNum >= 1 && moveNum <= 60) {
      clipUrls.push({
        url: buildClipUrl(voice, lang, `numbers/${moveNum}`),
        pauseAfter: 150,
      });
    }

    // Move clip
    const clipPath = sanToClipPath(san);
    if (clipPath) {
      clipUrls.push({
        url: buildClipUrl(voice, lang, clipPath),
        pauseAfter: 350,
      });
    }
  }

  // Annotation clips
  for (const anno of annotations) {
    const annoPath = annotationToClipPath(anno);
    if (annoPath) {
      clipUrls.push({
        url: buildClipUrl(voice, lang, annoPath),
        pauseAfter: 200,
      });
    }
  }

  if (clipUrls.length === 0) return;

  // Fetch all clips in parallel
  const blobUrls = await Promise.all(clipUrls.map((c) => fetchClip(c.url)));

  // Check if interrupted during fetch
  if (generation !== getRequestGeneration()) return;

  // Play clips in sequence
  for (let i = 0; i < blobUrls.length; i++) {
    // Check for interruption before each clip
    if (generation !== getRequestGeneration()) return;

    const blobUrl = blobUrls[i];
    if (!blobUrl) continue; // skip failed fetches

    await playClip(blobUrl, volume, speed);

    // Check for interruption after playback
    if (generation !== getRequestGeneration()) return;

    // Pause between clips (skip after last)
    if (i < blobUrls.length - 1) {
      await delay(clipUrls[i].pauseAfter / speed);
    }
  }

  setCurrentAudio(null);
}

/**
 * Plays a pre-recorded demo narration clip from R2.
 * Used when a PGN has [AudioSource "demo"] header.
 */
export async function playDemoNarration(
  halfMoves: number,
  lang: string,
  gender = "male",
): Promise<void> {
  const store = getDefaultStore();
  const volume = store.get(ttsVolumeAtom);
  const speed = store.get(ttsSpeedAtom);
  const generation = getRequestGeneration();

  const url = `${CLOUD_BASE_URL}/demo/${lang}/${gender}/move-${halfMoves}.mp3`;
  const blobUrl = await fetchClip(url);

  if (generation !== getRequestGeneration()) return;
  if (!blobUrl) return; // 404 — no clip for this move, silently skip

  await playClip(blobUrl, volume, speed);
  setCurrentAudio(null);
}

/**
 * Prefetches all demo narration clips for a game tree.
 * Called when a demo PGN is loaded so clips are cached before the user navigates.
 * Shows an error notification if the network is unavailable.
 */
export async function prefetchDemoClips(
  root: TreeNode,
  lang: string,
  gender = "male",
): Promise<void> {
  // Collect all halfMoves that have commentary or annotations
  const halfMoves: number[] = [];
  if (root.comment) halfMoves.push(0); // intro comment

  const queue: TreeNode[] = [...root.children];
  while (queue.length > 0) {
    const node = queue.pop()!;
    if (node.comment || node.annotations.length > 0) {
      halfMoves.push(node.halfMoves);
    }
    for (const child of node.children) {
      queue.push(child);
    }
  }

  if (halfMoves.length === 0) return;

  const urls = halfMoves.map(
    (hm) => `${CLOUD_BASE_URL}/demo/${lang}/${gender}/move-${hm}.mp3`,
  );

  // Connectivity check — try to reach the first clip URL
  try {
    await fetch(urls[0], { method: "HEAD" });
  } catch {
    notifications.show({
      title: "Demo audio unavailable",
      message:
        "Internet access is required to load the demo narration audio files. Connect to the internet and try again.",
      color: "red",
      autoClose: 10000,
    });
    return;
  }

  // Fetch all clips in parallel into cache
  await Promise.all(urls.map((url) => fetchClip(url)));
  console.log(`Demo TTS: prefetched ${urls.length} clips for lang=${lang}`);
}

/**
 * Plays a demo clip for the Settings test button.
 * Sequence: "1" + "pawn e4" + "Good move"
 */
export async function playCloudDemoClip(): Promise<void> {
  const store = getDefaultStore();
  const volume = store.get(ttsVolumeAtom);
  const speed = store.get(ttsSpeedAtom);
  const generation = getRequestGeneration();

  const voice = "daniel";
  const lang = "en";

  const clips = [
    { url: buildClipUrl(voice, lang, "numbers/1"), pauseAfter: 150 },
    { url: buildClipUrl(voice, lang, "moves/pawn-e4"), pauseAfter: 350 },
    { url: buildClipUrl(voice, lang, "annotations/good"), pauseAfter: 0 },
  ];

  const blobUrls = await Promise.all(clips.map((c) => fetchClip(c.url)));
  if (generation !== getRequestGeneration()) return;

  for (let i = 0; i < blobUrls.length; i++) {
    if (generation !== getRequestGeneration()) return;
    const blobUrl = blobUrls[i];
    if (!blobUrl) continue;
    await playClip(blobUrl, volume, speed);
    if (generation !== getRequestGeneration()) return;
    if (i < blobUrls.length - 1) {
      await delay(clips[i].pauseAfter / speed);
    }
  }

  setCurrentAudio(null);
}
