/**
 * Multiplayer relay client — singleton socket.io connection to the relay server.
 *
 * Reads relay URL from relayUrlAtom via the Jotai store (same pattern as tts.ts).
 */

import { getDefaultStore } from "jotai";
import { io, type Socket } from "socket.io-client";
import { relayUrlAtom } from "@/state/atoms";

let socket: Socket | null = null;
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
let lastPeerActivity = 0;

// --- Connection ---

export function connectToRelay(): void {
  if (socket?.connected) return;

  const store = getDefaultStore();
  const url = store.get(relayUrlAtom);
  if (!url) return;

  socket = io(url, {
    transports: ["websocket"],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
  });

  socket.on("connect", () => {
    console.log("[relay] connected:", socket?.id);
  });

  socket.on("disconnect", (reason) => {
    console.log("[relay] disconnected:", reason);
    stopHeartbeat();
  });

  socket.on("connect_error", (err) => {
    console.warn("[relay] connection error:", err.message);
  });
}

export function disconnectFromRelay(): void {
  stopHeartbeat();
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}

// --- Game lifecycle ---

export function createGame(playerName: string): Promise<{ code: string }> {
  return new Promise((resolve, reject) => {
    if (!socket?.connected) {
      reject(new Error("Not connected to relay"));
      return;
    }

    function onCreated(data: { code: string }) {
      clearTimeout(timeout);
      socket?.off("error", onError);
      resolve(data);
    }

    function onError(data: { message: string }) {
      clearTimeout(timeout);
      socket?.off("game_created", onCreated);
      reject(new Error(data.message));
    }

    const timeout = setTimeout(() => {
      socket?.off("game_created", onCreated);
      socket?.off("error", onError);
      reject(new Error("Create game timed out"));
    }, 10_000);

    socket.once("game_created", onCreated);
    socket.once("error", onError);
    socket.emit("create_game", { name: playerName });
  });
}

export function joinGame(
  code: string,
  playerName: string,
): Promise<{ color: "white" | "black"; peerName: string }> {
  return new Promise((resolve, reject) => {
    if (!socket?.connected) {
      reject(new Error("Not connected to relay"));
      return;
    }

    function onJoined(data: { color: "white" | "black"; peerName: string }) {
      clearTimeout(timeout);
      socket?.off("error", onError);
      resolve(data);
    }

    function onError(data: { message: string }) {
      clearTimeout(timeout);
      socket?.off("game_joined", onJoined);
      reject(new Error(data.message));
    }

    const timeout = setTimeout(() => {
      socket?.off("game_joined", onJoined);
      socket?.off("error", onError);
      reject(new Error("Join game timed out"));
    }, 10_000);

    socket.once("game_joined", onJoined);
    socket.once("error", onError);
    socket.emit("join_game", { code, name: playerName });
  });
}

// --- In-game actions ---

export function sendMove(
  uci: string,
  whiteTime?: number,
  blackTime?: number,
): void {
  socket?.emit("game_move", { uci, whiteTime, blackTime });
}

export function sendResign(color: string): void {
  socket?.emit("resign", { color });
}

export function sendDrawOffer(): void {
  socket?.emit("offer_draw");
}

export function sendAcceptDraw(): void {
  socket?.emit("accept_draw");
}

export function sendReady(): void {
  socket?.emit("ready");
}

// --- Event callbacks (return cleanup functions) ---

export function onPeerJoined(cb: (name: string) => void): () => void {
  const handler = (data: { peerName: string }) => cb(data.peerName);
  socket?.on("peer_joined", handler);
  return () => {
    socket?.off("peer_joined", handler);
  };
}

export function onPeerMove(
  cb: (uci: string, whiteTime?: number, blackTime?: number) => void,
): () => void {
  const handler = (data: {
    uci: string;
    whiteTime?: number;
    blackTime?: number;
  }) => {
    lastPeerActivity = Date.now();
    cb(data.uci, data.whiteTime, data.blackTime);
  };
  socket?.on("game_move", handler);
  return () => {
    socket?.off("game_move", handler);
  };
}

export function onPeerResign(cb: (color: string) => void): () => void {
  const handler = (data: { color: string }) => cb(data.color);
  socket?.on("resign", handler);
  return () => {
    socket?.off("resign", handler);
  };
}

export function onPeerLeft(cb: () => void): () => void {
  socket?.on("peer_left", cb);
  return () => {
    socket?.off("peer_left", cb);
  };
}

export function onDrawOffer(cb: () => void): () => void {
  socket?.on("offer_draw", cb);
  return () => {
    socket?.off("offer_draw", cb);
  };
}

export function onDrawAccepted(cb: () => void): () => void {
  socket?.on("accept_draw", cb);
  return () => {
    socket?.off("accept_draw", cb);
  };
}

export function onPeerReady(cb: () => void): () => void {
  socket?.on("peer_ready", cb);
  return () => {
    socket?.off("peer_ready", cb);
  };
}

// --- Heartbeat / Presence (Phase 3) ---

export function startHeartbeat(): void {
  stopHeartbeat();
  lastPeerActivity = Date.now();

  // Track peer heartbeats
  socket?.on("peer_heartbeat", () => {
    lastPeerActivity = Date.now();
  });

  heartbeatInterval = setInterval(() => {
    socket?.emit("heartbeat");
  }, 5_000);
}

export function stopHeartbeat(): void {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  socket?.off("peer_heartbeat");
}

export function isPeerAlive(timeoutMs = 10_000): boolean {
  if (lastPeerActivity === 0) return true; // no data yet, assume alive
  return Date.now() - lastPeerActivity < timeoutMs;
}
