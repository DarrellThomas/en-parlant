import type { BestMoves } from "@/bindings";
import { formatScore } from "@/utils/score";

export function formatEngineLines(
  engineName: string,
  variations: BestMoves[],
  halfMoves: number,
  threat: boolean,
): string {
  const depth = variations[0].depth;
  const lines = variations.map((v) => {
    const score = formatScore(v.score.value);
    const movesStr = formatMoves(v.sanMoves, halfMoves, threat);
    return `${score}: ${movesStr}`;
  });

  return `${engineName} Depth ${depth}\n${lines.join("\n")}`;
}

function formatMoves(
  sanMoves: string[],
  halfMoves: number,
  threat: boolean,
): string {
  const parts: string[] = [];
  for (let i = 0; i < sanMoves.length; i++) {
    const totalMoves = halfMoves + i + 1 + (threat ? 1 : 0);
    const isWhite = totalMoves % 2 === 1;
    const moveNumber = Math.ceil(totalMoves / 2);

    if (i === 0 || isWhite) {
      parts.push(`${moveNumber}${isWhite ? "." : "..."} ${sanMoves[i]}`);
    } else {
      parts.push(sanMoves[i]);
    }
  }
  return parts.join(" ");
}
