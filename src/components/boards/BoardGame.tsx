import {
  ActionIcon,
  Box,
  Button,
  Checkbox,
  Divider,
  Group,
  Indicator,
  Paper,
  Portal,
  ScrollArea,
  SegmentedControl,
  Stack,
  Text,
} from "@mantine/core";
import { useToggle } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  IconArrowsExchange,
  IconCheck,
  IconExternalLink,
  IconFileText,
  IconHandStop,
  IconPlus,
  IconX,
  IconZoomCheck,
} from "@tabler/icons-react";
import type { Piece } from "chessops";
import { makeUci, parseUci } from "chessops";
import { INITIAL_FEN } from "chessops/fen";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { match } from "ts-pattern";
import { useStore } from "zustand";
import type { Outcome } from "@/bindings";
import {
  commands,
  type EngineLog,
  events,
  type GameConfig,
  type GameResult,
  type PlayerConfig,
} from "@/bindings";
import type { ChessgroundRef } from "@/chessground/Chessground";
import {
  activeTabAtom,
  currentDrawOfferAtom,
  currentGameIdAtom,
  currentGameStateAtom,
  currentIsMultiplayerAtom,
  currentLocalColorAtom,
  currentLocalReadyAtom,
  currentMultiplayerStateAtom,
  currentPeerNameAtom,
  currentPeerOnlineAtom,
  currentPeerReadyAtom,
  currentPlayersAtom,
  gameInputColorAtom,
  gamePlayer1SettingsAtom,
  gamePlayer2SettingsAtom,
  gameSameTimeControlAtom,
  playerNameAtom,
  tabsAtom,
} from "@/state/atoms";
import { positionFromFen } from "@/utils/chessops";
import {
  disconnectFromRelay,
  isPeerAlive,
  onDrawAccepted,
  onDrawOffer,
  onPeerLeft,
  onPeerMove,
  onPeerReady,
  onPeerResign,
  sendAcceptDraw,
  sendDrawOffer,
  sendMove,
  sendReady,
  sendResign,
} from "@/utils/relay";
import { type Tab, genID } from "@/utils/tabs";
import type { GameHeaders } from "@/utils/treeReducer";
import { unwrap } from "@/utils/unwrap";
import EngineLogsView from "../common/EngineLogsView";
import GameInfo from "../common/GameInfo";
import GameNotation from "../common/GameNotation";
import MoveControls from "../common/MoveControls";
import { TreeStateContext } from "../common/TreeStateContext";
import Board from "./Board";
import BoardControls from "./BoardControls";
import EditingCard from "./EditingCard";
import MultiplayerSetup from "./MultiplayerSetup";
import { OpponentForm, type OpponentSettings } from "./OpponentForm";

function gameResultToOutcome(result: GameResult): Outcome {
  if (result.type === "whiteWins") return "1-0";
  if (result.type === "blackWins") return "0-1";
  return "1/2-1/2";
}

type BackendMove = { uci: string; clock: number | null };

function mapBackendMoves(
  moves: { uci: string; clock: bigint | null }[],
): BackendMove[] {
  return moves.map((m) => ({
    uci: m.uci,
    clock: m.clock !== null ? Number(m.clock) : null,
  }));
}

function BoardGame() {
  const { t } = useTranslation();
  const activeTab = useAtomValue(activeTabAtom);
  const setActiveTab = useSetAtom(activeTabAtom);

  const [editingMode, toggleEditingMode] = useToggle();
  const [selectedPiece, setSelectedPiece] = useState<Piece | null>(null);

  const [inputColor, setInputColor] = useAtom(gameInputColorAtom);
  function cycleColor() {
    setInputColor((prev) =>
      match(prev)
        .with("white", () => "black" as const)
        .with("black", () => "random" as const)
        .with("random", () => "white" as const)
        .exhaustive(),
    );
  }

  const [player1Settings, setPlayer1Settings] = useAtom(
    gamePlayer1SettingsAtom,
  );
  const [player2Settings, setPlayer2Settings] = useAtom(
    gamePlayer2SettingsAtom,
  );

  function getPlayers() {
    let isPlayer1White = inputColor === "white";

    if (inputColor === "random") {
      isPlayer1White = Math.random() > 0.5;
    }

    return {
      white: isPlayer1White ? player1Settings : player2Settings,
      black: isPlayer1White ? player2Settings : player1Settings,
    };
  }

  const treeStore = useContext(TreeStateContext)!;
  const root = useStore(treeStore, (s) => s.root);
  const headers = useStore(treeStore, (s) => s.headers);
  const setFen = useStore(treeStore, (s) => s.setFen);
  const setHeaders = useStore(treeStore, (s) => s.setHeaders);
  const resetTree = useStore(treeStore, (s) => s.reset);
  const setResult = useStore(treeStore, (s) => s.setResult);
  const appendMove = useStore(treeStore, (s) => s.appendMove);

  const [, setTabs] = useAtom(tabsAtom);

  const boardRef = useRef(null);
  const cgRef = useRef<ChessgroundRef>(null);
  const [gameState, setGameState] = useAtom(currentGameStateAtom);
  const [players, setPlayers] = useAtom(currentPlayersAtom);

  const [whiteTime, setWhiteTime] = useState<number | null>(null);
  const [blackTime, setBlackTime] = useState<number | null>(null);
  const [gameId, setGameId] = useAtom(currentGameIdAtom);

  const [logsOpened, toggleLogsOpened] = useToggle();
  const [logsColor, setLogsColor] = useState<"white" | "black">("white");
  const [engineLogs, setEngineLogs] = useState<EngineLog[]>([]);

  // Multiplayer state
  const [isMultiplayer] = useAtom(currentIsMultiplayerAtom);
  const [multiplayerState, setMultiplayerState] = useAtom(
    currentMultiplayerStateAtom,
  );
  const [localColor] = useAtom(currentLocalColorAtom);
  const [peerName] = useAtom(currentPeerNameAtom);
  const [peerOnline, setPeerOnline] = useAtom(currentPeerOnlineAtom);
  const [drawOffer, setDrawOffer] = useAtom(currentDrawOfferAtom);
  const [localReady, setLocalReady] = useAtom(currentLocalReadyAtom);
  const [peerReady, setPeerReady] = useAtom(currentPeerReadyAtom);
  const [playerName] = useAtom(playerNameAtom);
  // Snapshot name at connect time so shared localStorage doesn't overwrite it
  const myNameRef = useRef(playerName);
  if (
    multiplayerState.phase === "connected" &&
    myNameRef.current !== playerName &&
    gameState === "settingUp"
  ) {
    myNameRef.current = playerName;
  }
  const myName = isMultiplayer ? myNameRef.current : playerName;

  const hasEngine =
    players.white.type === "engine" || players.black.type === "engine";

  const isPlayerVsEngine =
    (players.white.type === "human" && players.black.type === "engine") ||
    (players.black.type === "human" && players.white.type === "engine");

  const fetchEngineLogs = useCallback(async () => {
    if (!gameId || !hasEngine) return;
    let color = logsColor;
    if (players.white.type === "human" && players.black.type === "engine") {
      color = "black";
    } else if (
      players.black.type === "human" &&
      players.white.type === "engine"
    ) {
      color = "white";
    }
    const result = await commands.getGameEngineLogs(gameId, color);
    if (result.status === "ok") {
      setEngineLogs(result.data);
    }
  }, [gameId, logsColor, hasEngine, players.white.type, players.black.type]);

  useEffect(() => {
    if (logsOpened) {
      fetchEngineLogs();
    }
  }, [logsOpened, fetchEngineLogs]);

  useEffect(() => {
    if (!isMultiplayer) {
      notifications.show({
        message: "Press Start to begin",
        autoClose: 3000,
        withBorder: true,
      });
    }
  }, [isMultiplayer]);

  const syncTreeWithMoves = useCallback(
    (backendMoves: BackendMove[]) => {
      const treeMoves: string[] = [];
      let node = root;
      while (node.children.length > 0) {
        node = node.children[0];
        if (node.move) {
          treeMoves.push(makeUci(node.move));
        }
      }

      let needsReset = false;
      for (let i = 0; i < treeMoves.length; i++) {
        if (i >= backendMoves.length || treeMoves[i] !== backendMoves[i].uci) {
          needsReset = true;
          break;
        }
      }

      if (needsReset) {
        setFen(root.fen);
        for (const move of backendMoves) {
          const parsed = parseUci(move.uci);
          if (parsed) {
            appendMove({
              payload: parsed,
              clock: move.clock !== null ? Number(move.clock) : undefined,
            });
          }
        }
        return true;
      }

      if (backendMoves.length > treeMoves.length) {
        for (let i = treeMoves.length; i < backendMoves.length; i++) {
          const move = backendMoves[i];
          const parsed = parseUci(move.uci);
          if (parsed) {
            appendMove({
              payload: parsed,
              clock: move.clock !== null ? Number(move.clock) : undefined,
            });
          }
        }
        return true;
      }

      return false;
    },
    [root, setFen, appendMove],
  );

  function changeToAnalysisMode() {
    if (isMultiplayer) {
      disconnectFromRelay();
    }
    setTabs((prev) =>
      prev.map((tab) =>
        tab.value === activeTab ? { ...tab, type: "analysis" } : tab,
      ),
    );
  }

  const [pos, error] = useMemo(() => {
    let node = root;
    while (node.children.length > 0) {
      node = node.children[0];
    }
    return positionFromFen(node.fen);
  }, [root]);

  function toPlayerConfig(settings: OpponentSettings): PlayerConfig {
    if (settings.type === "human") {
      return {
        type: "human",
        name: settings.name ?? "Player",
      };
    }
    return {
      type: "engine",
      name: settings.engine?.name ?? "Engine",
      path: settings.engine?.path ?? "",
      options: (settings.engineSettings ?? settings.engine?.settings ?? [])
        .filter((s) => s.name !== "MultiPV")
        .map((s) => ({
          name: s.name,
          value: s.value?.toString() ?? "",
        })),
      go: settings.timeControl ? null : settings.go,
    };
  }

  function getTreeMoves(): string[] {
    const moves: string[] = [];
    let node = root;
    while (node.children.length > 0) {
      node = node.children[0];
      if (node.move) {
        moves.push(makeUci(node.move));
      }
    }
    return moves;
  }

  // Start game — used for both local and multiplayer
  async function startGame(fresh = false) {
    let playerSettings: {
      white: OpponentSettings;
      black: OpponentSettings;
    };

    if (isMultiplayer && localColor) {
      // Both players are human in multiplayer
      const localSettings: OpponentSettings = {
        type: "human",
        name: myName || "Player",
      };
      const remoteSettings: OpponentSettings = {
        type: "human",
        name: peerName || "Opponent",
      };
      playerSettings =
        localColor === "white"
          ? { white: localSettings, black: remoteSettings }
          : { white: remoteSettings, black: localSettings };
    } else {
      playerSettings = getPlayers();
    }

    setPlayers(playerSettings);

    const newGameId = `${activeTab}-game`;
    setGameId(newGameId);

    const initialMoves = fresh ? [] : getTreeMoves();

    const config: GameConfig = {
      white: toPlayerConfig(playerSettings.white),
      black: toPlayerConfig(playerSettings.black),
      whiteTimeControl: playerSettings.white.timeControl
        ? {
            initialTime: playerSettings.white.timeControl.seconds,
            increment: playerSettings.white.timeControl.increment ?? 0,
          }
        : null,
      blackTimeControl: playerSettings.black.timeControl
        ? {
            initialTime: playerSettings.black.timeControl.seconds,
            increment: playerSettings.black.timeControl.increment ?? 0,
          }
        : null,
      initialFen: fresh ? null : root.fen === INITIAL_FEN ? null : root.fen,
      initialMoves,
    } as GameConfig;

    try {
      const result = await commands.startGame(newGameId, config);
      const state = unwrap(result);

      setWhiteTime(state.whiteTime !== null ? Number(state.whiteTime) : null);
      setBlackTime(state.blackTime !== null ? Number(state.blackTime) : null);

      setGameState("playing");

      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, ".");
      const timeStr = now.toISOString().slice(11, 19);

      const eventStr = isMultiplayer
        ? "Multiplayer Game"
        : (() => {
            const whiteIsEngine = playerSettings.white.type === "engine";
            const blackIsEngine = playerSettings.black.type === "engine";
            if (whiteIsEngine && blackIsEngine) return "Engine Match";
            if (whiteIsEngine || blackIsEngine) return "Player vs Engine";
            return "Player Match";
          })();

      const formatTimeControl = (settings: OpponentSettings): string => {
        if (!settings.timeControl) return "-";
        const seconds = settings.timeControl.seconds / 1000;
        const increment = (settings.timeControl.increment ?? 0) / 1000;
        return increment ? `${seconds}+${increment}` : `${seconds}`;
      };

      const whiteTimeControl = formatTimeControl(playerSettings.white);
      const blackTimeControl = formatTimeControl(playerSettings.black);
      const sameTC = whiteTimeControl === blackTimeControl;

      const newHeaders: Partial<GameHeaders> = {
        white: state.whitePlayer,
        black: state.blackPlayer,
        event: eventStr,
        site: "En Parlant~",
        date: dateStr,
        time: timeStr,
        time_control: undefined,
      };

      if (sameTC) {
        if (whiteTimeControl !== "-") {
          newHeaders.time_control = whiteTimeControl;
        }
      } else {
        newHeaders.white_time_control = whiteTimeControl;
        newHeaders.black_time_control = blackTimeControl;
      }

      setHeaders({
        ...headers,
        ...newHeaders,
        fen: root.fen,
      });

      setTabs((prev) =>
        prev.map((tab) =>
          tab.value === activeTab
            ? { ...tab, name: `${state.whitePlayer} vs. ${state.blackPlayer}` }
            : tab,
        ),
      );
    } catch (err) {
      console.error("Failed to start game:", err);
    }
  }

  const handleHumanMove = useCallback(
    async (uci: string) => {
      if (!gameId || gameState !== "playing") return;

      // In multiplayer, only allow moves on our turn
      if (isMultiplayer && localColor && pos) {
        if (localColor !== pos.turn) return;
        // Send move to relay
        sendMove(uci, whiteTime ?? undefined, blackTime ?? undefined);
      }

      try {
        await commands.makeGameMove(gameId, uci);
      } catch (err) {
        console.error("Failed to make move:", err);
      }
    },
    [gameId, gameState, isMultiplayer, localColor, pos, whiteTime, blackTime],
  );

  const pendingMovesRef = useRef<
    { uci: string; clock: number | null }[] | null
  >(null);
  const pendingTimesRef = useRef<{
    white: number | null;
    black: number | null;
  } | null>(null);
  const throttleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const THROTTLE_MS = 150;

  const syncTreeWithMovesRef = useRef(syncTreeWithMoves);
  syncTreeWithMovesRef.current = syncTreeWithMoves;

  const applyPendingUpdates = useCallback(() => {
    if (pendingMovesRef.current) {
      syncTreeWithMovesRef.current(pendingMovesRef.current);
      pendingMovesRef.current = null;
    }
    if (pendingTimesRef.current) {
      setWhiteTime(pendingTimesRef.current.white);
      setBlackTime(pendingTimesRef.current.black);
      pendingTimesRef.current = null;
    }
    throttleTimerRef.current = null;

    setTimeout(() => {
      cgRef.current?.playPremove();
    }, 0);
  }, []);

  const scheduleUpdate = useCallback(() => {
    if (!throttleTimerRef.current) {
      throttleTimerRef.current = setTimeout(applyPendingUpdates, THROTTLE_MS);
    }
  }, [applyPendingUpdates]);

  const onTakeBack = useCallback(async () => {
    if (!gameId || gameState !== "playing") return;
    await commands.takeBackGameMove(gameId);
  }, [gameId, gameState]);

  useEffect(() => {
    if (gameState !== "playing" || !gameId) return;

    const currentGameId = gameId;

    const unlistenMove = events.gameMoveEvent.listen(({ payload }) => {
      if (payload.gameId !== currentGameId) return;

      pendingMovesRef.current = mapBackendMoves(payload.moves);
      pendingTimesRef.current = {
        white: payload.whiteTime !== null ? Number(payload.whiteTime) : null,
        black: payload.blackTime !== null ? Number(payload.blackTime) : null,
      };
      scheduleUpdate();
    });

    const unlistenClock = events.clockUpdateEvent.listen(({ payload }) => {
      if (payload.gameId !== currentGameId) return;
      setWhiteTime(
        payload.whiteTime !== null ? Number(payload.whiteTime) : null,
      );
      setBlackTime(
        payload.blackTime !== null ? Number(payload.blackTime) : null,
      );
    });

    const unlistenGameOver = events.gameOverEvent.listen(({ payload }) => {
      if (payload.gameId !== currentGameId) return;

      if (throttleTimerRef.current) {
        clearTimeout(throttleTimerRef.current);
        throttleTimerRef.current = null;
      }
      pendingMovesRef.current = null;
      pendingTimesRef.current = null;

      syncTreeWithMovesRef.current(mapBackendMoves(payload.moves));

      setGameState("gameOver");
      setResult(gameResultToOutcome(payload.result));
    });

    return () => {
      if (throttleTimerRef.current) {
        clearTimeout(throttleTimerRef.current);
        throttleTimerRef.current = null;
      }
      unlistenMove.then((f) => f());
      unlistenClock.then((f) => f());
      unlistenGameOver.then((f) => f());
    };
  }, [gameId, gameState, scheduleUpdate, setGameState, setResult]);

  // Multiplayer: listen for ready and disconnect (no gameId needed)
  useEffect(() => {
    if (!isMultiplayer || multiplayerState.phase !== "connected") return;

    const cleanup1 = onPeerReady(() => {
      setPeerReady(true);
    });

    const cleanup2 = onPeerLeft(() => {
      setPeerOnline(false);
      if (gameStateRef.current === "gameOver") return;
      setMultiplayerState({ ...multiplayerState, phase: "disconnected" });
      notifications.show({
        message: t("Multiplayer.OpponentDisconnected"),
        autoClose: false,
        withBorder: true,
        color: "orange",
      });
    });

    return () => {
      cleanup1();
      cleanup2();
    };
  }, [
    isMultiplayer,
    multiplayerState,
    t,
    setPeerReady,
    setPeerOnline,
    setMultiplayerState,
  ]);

  // Multiplayer: listen for remote moves, resign, draw offers (needs gameId)
  useEffect(() => {
    if (!isMultiplayer || multiplayerState.phase !== "connected" || !gameId)
      return;

    const currentGameId = gameId;

    const cleanup1 = onPeerMove(async (uci, wt, bt) => {
      try {
        await commands.makeGameMove(currentGameId, uci);
        if (wt !== undefined) setWhiteTime(wt);
        if (bt !== undefined) setBlackTime(bt);
      } catch (err) {
        console.error("Failed to apply remote move:", err);
      }
    });

    const cleanup2 = onPeerResign(async (color) => {
      await commands.resignGame(currentGameId, color);
      setGameState("gameOver");
      setResult(color === "white" ? "0-1" : "1-0");
      notifications.show({
        message: t("Multiplayer.OpponentResigned"),
        autoClose: 5000,
        withBorder: true,
      });
    });

    const cleanup3 = onDrawOffer(() => {
      setDrawOffer({ offered: false, received: true });
      notifications.show({
        message: t("Multiplayer.DrawOffered"),
        autoClose: 10000,
        withBorder: true,
      });
    });

    const cleanup4 = onDrawAccepted(() => {
      setDrawOffer({ offered: false, received: false });
      setGameState("gameOver");
      setResult("1/2-1/2");
    });

    return () => {
      cleanup1();
      cleanup2();
      cleanup3();
      cleanup4();
    };
  }, [
    isMultiplayer,
    multiplayerState,
    gameId,
    t,
    setDrawOffer,
    setGameState,
    setResult,
  ]);

  // Multiplayer: peer online check interval
  useEffect(() => {
    if (!isMultiplayer || multiplayerState.phase !== "connected") return;

    const interval = setInterval(() => {
      setPeerOnline(isPeerAlive());
    }, 3000);

    return () => clearInterval(interval);
  }, [isMultiplayer, multiplayerState.phase, setPeerOnline]);

  useEffect(() => {
    if (gameState === "playing" && gameId) {
      commands.getGameState(gameId).then((result) => {
        if (result.status === "ok") {
          const state = result.data;

          syncTreeWithMovesRef.current(mapBackendMoves(state.moves));

          setWhiteTime(
            state.whiteTime !== null ? Number(state.whiteTime) : null,
          );
          setBlackTime(
            state.blackTime !== null ? Number(state.blackTime) : null,
          );

          if (state.status !== "playing") {
            setGameState("gameOver");
            if (
              typeof state.status === "object" &&
              "finished" in state.status
            ) {
              setResult(gameResultToOutcome(state.status.finished.result));
            }
          }
        }
      });
    }
  }, [gameId, gameState, setGameState, setResult]);

  const movable = useMemo(() => {
    // In multiplayer, restrict to local color only
    if (isMultiplayer && localColor) {
      return localColor;
    }
    if (players.white.type === "human" && players.black.type === "human") {
      return "turn";
    }
    if (players.white.type === "human") {
      return "white";
    }
    if (players.black.type === "human") {
      return "black";
    }
    return "none";
  }, [players, isMultiplayer, localColor]);

  const [sameTimeControl, setSameTimeControl] = useAtom(
    gameSameTimeControlAtom,
  );

  const onePlayerIsEngine = players.white.type !== players.black.type;
  const isEngineVsEngine =
    players.white.type === "engine" && players.black.type === "engine";

  function getResignationLosingColor(): "white" | "black" {
    if (isMultiplayer && localColor) {
      return localColor;
    }
    if (isPlayerVsEngine) {
      return players.white.type === "human" ? "white" : "black";
    }
    return pos?.turn === "white" ? "white" : "black";
  }

  async function handleAbort() {
    if (!gameId) return;
    await commands.abortGame(gameId);
    setGameState("gameOver");
    setResult("*");
    if (isMultiplayer) {
      disconnectFromRelay();
    }
  }

  async function handleResign() {
    if (!gameId) return;
    const losingColor = getResignationLosingColor();
    if (isMultiplayer) {
      sendResign(losingColor);
      notifications.show({
        message: t("Multiplayer.YouResigned"),
        autoClose: 5000,
        withBorder: true,
        color: "red",
      });
    }
    await commands.resignGame(gameId, losingColor);
  }

  function handleDrawOffer() {
    if (drawOffer.received) {
      // Accept incoming draw
      sendAcceptDraw();
      setDrawOffer({ offered: false, received: false });
      setGameState("gameOver");
      setResult("1/2-1/2");
    } else {
      // Offer draw
      sendDrawOffer();
      setDrawOffer({ offered: true, received: false });
      notifications.show({
        message: t("Multiplayer.DrawOfferSent"),
        autoClose: 3000,
        withBorder: true,
      });
    }
  }

  function handlePlayAgain() {
    // Multiplayer: stay connected, signal ready for rematch
    setLocalReady(true);
    sendReady();
    if (peerReady) {
      // Both ready — start new game
      startRematch();
    }
  }

  async function startRematch() {
    setLocalReady(false);
    setPeerReady(false);
    setGameId(null);
    setWhiteTime(null);
    setBlackTime(null);
    resetTree();
    setDrawOffer({ offered: false, received: false });
    // Go directly to game with fresh board
    await startGame(true);
  }

  async function handleNewGame() {
    setGameId(null);
    setGameState("settingUp");
    setWhiteTime(null);
    setBlackTime(null);
    resetTree();
    if (isMultiplayer) {
      disconnectFromRelay();
      setLocalReady(false);
      setPeerReady(false);
      setMultiplayerState({ phase: "idle" });
      setDrawOffer({ offered: false, received: false });
    }
  }

  // Multiplayer: refs for values needed in stable callbacks
  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;

  // Multiplayer: start game when both players are ready
  const startGameRef = useRef(startGame);
  startGameRef.current = startGame;
  const startRematchRef = useRef(startRematch);
  startRematchRef.current = startRematch;
  useEffect(() => {
    if (!isMultiplayer || !localReady || !peerReady) return;
    if (multiplayerState.phase === "connected" && gameState === "settingUp") {
      startGameRef.current();
      setLocalReady(false);
      setPeerReady(false);
    } else if (gameState === "gameOver") {
      startRematchRef.current();
    }
  }, [
    isMultiplayer,
    localReady,
    peerReady,
    multiplayerState.phase,
    gameState,
    setLocalReady,
    setPeerReady,
  ]);

  return (
    <>
      <Portal target="#left" style={{ height: "100%" }}>
        <Board
          editingMode={
            gameState === "settingUp" && editingMode && !isMultiplayer
          }
          viewOnly={gameState !== "playing" && !editingMode}
          disableVariations
          boardRef={boardRef}
          movable={
            gameState === "settingUp" && editingMode && !isMultiplayer
              ? "none"
              : movable
          }
          whiteTime={
            gameState === "playing" ? (whiteTime ?? undefined) : undefined
          }
          blackTime={
            gameState === "playing" ? (blackTime ?? undefined) : undefined
          }
          onMove={handleHumanMove}
          selectedPiece={selectedPiece}
          cgRef={cgRef}
          enablePremoves={
            (isPlayerVsEngine || isMultiplayer) && gameState === "playing"
          }
        />
      </Portal>
      <Portal target="#topRight" style={{ height: "100%", overflow: "hidden" }}>
        <Paper withBorder shadow="sm" p="md" h="100%">
          {logsOpened ? (
            <EngineLogsView
              logs={engineLogs}
              onRefresh={fetchEngineLogs}
              additionalControls={
                <>
                  {players.white.type === "engine" &&
                  players.black.type === "engine" ? (
                    <SegmentedControl
                      value={logsColor}
                      onChange={(value) =>
                        setLogsColor(value as "white" | "black")
                      }
                      data={[
                        { value: "white", label: "White" },
                        { value: "black", label: "Black" },
                      ]}
                    />
                  ) : (
                    <div />
                  )}
                  <ActionIcon flex={0} onClick={() => toggleLogsOpened()}>
                    <IconX size="1.2rem" />
                  </ActionIcon>
                </>
              }
            />
          ) : (
            <>
              {gameState === "settingUp" && isMultiplayer && (
                <ScrollArea h="100%" offsetScrollbars>
                  {multiplayerState.phase === "connected" ? (
                    <Stack align="center" gap="md" pt="md">
                      <Group justify="space-between" w="100%">
                        <Stack gap={2}>
                          <Group gap="xs">
                            <Indicator color="green" size={8}>
                              <Text size="sm" fw={500}>
                                {myName || "Player"}
                              </Text>
                            </Indicator>
                          </Group>
                          <Text
                            size="xs"
                            c={localReady ? "green" : "dimmed"}
                            fw={localReady ? 600 : 400}
                          >
                            {localReady
                              ? t("Multiplayer.Ready")
                              : t("Multiplayer.NotReady")}
                          </Text>
                        </Stack>
                        <Text size="xs" c="dimmed">
                          vs
                        </Text>
                        <Stack gap={2} align="flex-end">
                          <Group gap="xs">
                            <Indicator
                              color={peerOnline ? "green" : "gray"}
                              size={8}
                              processing={peerOnline}
                            >
                              <Text size="sm" fw={500}>
                                {peerName || t("Multiplayer.Opponent")}
                              </Text>
                            </Indicator>
                          </Group>
                          <Text
                            size="xs"
                            c={peerReady ? "green" : "dimmed"}
                            fw={peerReady ? 600 : 400}
                          >
                            {peerReady
                              ? t("Multiplayer.Ready")
                              : t("Multiplayer.NotReady")}
                          </Text>
                        </Stack>
                      </Group>
                      <Group grow w="100%">
                        <Button
                          variant={localReady ? "filled" : "default"}
                          color={localReady ? "green" : undefined}
                          onClick={() => {
                            setLocalReady(true);
                            sendReady();
                          }}
                          disabled={localReady}
                          leftSection={<IconCheck />}
                          size="md"
                        >
                          {localReady
                            ? t("Multiplayer.WaitingForOpponent")
                            : t("Multiplayer.Ready")}
                        </Button>
                        <Button
                          variant="default"
                          color="red"
                          onClick={handleNewGame}
                          leftSection={<IconX />}
                          size="md"
                        >
                          {t("Multiplayer.Quit")}
                        </Button>
                      </Group>
                    </Stack>
                  ) : (
                    <MultiplayerSetup />
                  )}
                </ScrollArea>
              )}
              {gameState === "settingUp" && !isMultiplayer && (
                <ScrollArea h="100%" offsetScrollbars>
                  <Stack>
                    <Button
                      onClick={() => startGame()}
                      fullWidth
                      size="md"
                      variant="filled"
                      color="teal"
                      disabled={error !== null}
                    >
                      {t("Board.Opponent.StartGame")}
                    </Button>

                    <Group>
                      <Text flex={1} ta="center" fz="lg" fw="bold">
                        {match(inputColor)
                          .with("white", () => "White")
                          .with("random", () => "Random")
                          .with("black", () => "Black")
                          .exhaustive()}
                      </Text>
                      <ActionIcon onClick={cycleColor}>
                        <IconArrowsExchange />
                      </ActionIcon>
                      <Text flex={1} ta="center" fz="lg" fw="bold">
                        {match(inputColor)
                          .with("white", () => "Black")
                          .with("random", () => "Random")
                          .with("black", () => "White")
                          .exhaustive()}
                      </Text>
                    </Group>
                    <Box flex={1}>
                      <Group style={{ alignItems: "start" }}>
                        <OpponentForm
                          sameTimeControl={sameTimeControl}
                          opponent={player1Settings}
                          setOpponent={setPlayer1Settings}
                          setOtherOpponent={setPlayer2Settings}
                        />
                        <Divider orientation="vertical" />
                        <OpponentForm
                          sameTimeControl={sameTimeControl}
                          opponent={player2Settings}
                          setOpponent={setPlayer2Settings}
                          setOtherOpponent={setPlayer1Settings}
                        />
                      </Group>
                    </Box>

                    <Checkbox
                      label={t("Board.Opponent.SameTimeControl")}
                      checked={sameTimeControl}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setSameTimeControl(checked);
                        if (checked) {
                          setPlayer2Settings((prev) => ({
                            ...prev,
                            timeControl: player1Settings.timeControl,
                            timeUnit: player1Settings.timeUnit,
                            incrementUnit: player1Settings.incrementUnit,
                          }));
                        }
                      }}
                    />
                  </Stack>
                </ScrollArea>
              )}
              {(gameState === "playing" || gameState === "gameOver") && (
                <Stack h="100%">
                  <Box flex={1}>
                    {isMultiplayer && (
                      <Group justify="space-between" mb="sm">
                        <Stack gap={2}>
                          <Group gap="xs">
                            <Indicator color="green" size={8}>
                              <Text size="sm" fw={500}>
                                {myName || "Player"}
                              </Text>
                            </Indicator>
                            <Text size="xs" c="dimmed">
                              ({localColor})
                            </Text>
                          </Group>
                          {gameState === "gameOver" && (
                            <Text
                              size="xs"
                              c={localReady ? "green" : "dimmed"}
                              fw={localReady ? 600 : 400}
                            >
                              {localReady
                                ? t("Multiplayer.Ready")
                                : t("Multiplayer.NotReady")}
                            </Text>
                          )}
                        </Stack>
                        <Text size="xs" c="dimmed">
                          vs
                        </Text>
                        <Stack gap={2} align="flex-end">
                          <Group gap="xs">
                            <Indicator
                              color={peerOnline ? "green" : "gray"}
                              size={8}
                              processing={peerOnline}
                            >
                              <Text size="sm" fw={500}>
                                {peerName || t("Multiplayer.Opponent")}
                              </Text>
                            </Indicator>
                            <Text size="xs" c={peerOnline ? "green" : "dimmed"}>
                              ({localColor === "white" ? "black" : "white"})
                            </Text>
                          </Group>
                          {gameState === "gameOver" && (
                            <Text
                              size="xs"
                              c={peerReady ? "green" : "dimmed"}
                              fw={peerReady ? 600 : 400}
                            >
                              {peerReady
                                ? t("Multiplayer.Ready")
                                : t("Multiplayer.NotReady")}
                            </Text>
                          )}
                        </Stack>
                      </Group>
                    )}
                    {!isMultiplayer && <GameInfo headers={headers} />}
                  </Box>
                  <Group grow>
                    {gameState === "playing" && (
                      <Button
                        variant="default"
                        color="red"
                        onClick={
                          isEngineVsEngine && !isMultiplayer
                            ? handleAbort
                            : handleResign
                        }
                        leftSection={<IconX />}
                      >
                        {isEngineVsEngine && !isMultiplayer
                          ? "Abort"
                          : t("Multiplayer.Resign")}
                      </Button>
                    )}
                    {gameState === "playing" && isMultiplayer && (
                      <Button
                        variant="default"
                        onClick={handleDrawOffer}
                        leftSection={<IconHandStop size="1rem" />}
                        color={drawOffer.received ? "yellow" : undefined}
                      >
                        {drawOffer.received
                          ? t("Multiplayer.AcceptDraw")
                          : drawOffer.offered
                            ? t("Multiplayer.DrawPending")
                            : t("Multiplayer.OfferDraw")}
                      </Button>
                    )}
                    {gameState === "gameOver" && isMultiplayer && (
                      <>
                        {peerReady && !localReady && (
                          <Text size="xs" c="green" ta="center" fw={500}>
                            {t("Multiplayer.OpponentReady")}
                          </Text>
                        )}
                        <Button
                          variant={localReady ? "filled" : "default"}
                          color={localReady ? "green" : undefined}
                          onClick={handlePlayAgain}
                          disabled={localReady}
                          leftSection={<IconCheck />}
                        >
                          {t("Multiplayer.Ready")}
                        </Button>
                        <Button
                          variant="default"
                          color="red"
                          onClick={handleNewGame}
                          leftSection={<IconX />}
                        >
                          {t("Multiplayer.Quit")}
                        </Button>
                      </>
                    )}
                    {gameState === "gameOver" && !isMultiplayer && (
                      <Button
                        variant="default"
                        onClick={handleNewGame}
                        leftSection={<IconPlus />}
                      >
                        New Game
                      </Button>
                    )}
                    {(!isMultiplayer || gameState === "gameOver") && (
                      <Button
                        variant="default"
                        onClick={() => changeToAnalysisMode()}
                        leftSection={<IconZoomCheck />}
                      >
                        Analyze
                      </Button>
                    )}
                    {!isMultiplayer && (
                      <Button
                        variant="default"
                        onClick={() => {
                          const id = genID();
                          const snapshot = JSON.stringify({
                            version: 0,
                            state: {
                              root,
                              headers,
                              position: treeStore.getState().position,
                            },
                          });
                          sessionStorage.setItem(id, snapshot);
                          const gameName = headers.white && headers.black
                            ? `${headers.white} - ${headers.black}`
                            : t("BoardAnalysis.Title", "Analysis");
                          const name = `${t("BoardAnalysis.Title", "Analysis")}: ${gameName}`;
                          const newTab: Tab = { name, value: id, type: "analysis" };
                          setTabs((prev) =>
                            prev.length === 0
                              ? [newTab]
                              : [...prev, newTab],
                          );
                          setActiveTab(id);
                        }}
                        leftSection={<IconExternalLink />}
                      >
                        {t("Board.Action.AnalyzeInNewTab", "Analyze in New Tab")}
                      </Button>
                    )}

                    {hasEngine && !isMultiplayer && (
                      <Button
                        variant="default"
                        onClick={() => toggleLogsOpened()}
                        leftSection={<IconFileText size="1rem" />}
                      >
                        Engine Logs
                      </Button>
                    )}
                  </Group>
                </Stack>
              )}
            </>
          )}
        </Paper>
      </Portal>
      <Portal target="#bottomRight" style={{ height: "100%" }}>
        {gameState === "settingUp" && editingMode && !isMultiplayer ? (
          <EditingCard
            boardRef={boardRef}
            setEditingMode={toggleEditingMode}
            selectedPiece={selectedPiece}
            setSelectedPiece={setSelectedPiece}
          />
        ) : (
          <Stack h="100%" gap="xs">
            <GameNotation
              topBar
              controls={
                <BoardControls
                  editingMode={
                    gameState === "settingUp" && editingMode && !isMultiplayer
                  }
                  toggleEditingMode={toggleEditingMode}
                  dirty={false}
                  canTakeBack={onePlayerIsEngine && !isMultiplayer}
                  onTakeBack={onTakeBack}
                  disableVariations
                  allowEditing={gameState === "settingUp" && !isMultiplayer}
                />
              }
            />
            <MoveControls />
          </Stack>
        )}
      </Portal>
    </>
  );
}

export default BoardGame;
