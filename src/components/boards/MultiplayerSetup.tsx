import {
  ActionIcon,
  Button,
  Code,
  CopyButton,
  Group,
  Loader,
  PinInput,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { IconCheck, IconCopy } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  currentLocalColorAtom,
  currentMultiplayerStateAtom,
  currentPeerNameAtom,
  playerNameAtom,
} from "@/state/atoms";
import {
  connectToRelay,
  createGame,
  disconnectFromRelay,
  isRelayConfigured,
  joinGame,
  onPeerJoined,
  startHeartbeat,
  watchRelayStatus,
} from "@/utils/relay";

type SetupView = "choose" | "creating" | "waiting" | "joining";

export default function MultiplayerSetup() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [playerName, setPlayerName] = useAtom(playerNameAtom);
  const [, setMultiplayerState] = useAtom(currentMultiplayerStateAtom);
  const [, setLocalColor] = useAtom(currentLocalColorAtom);
  const [, setPeerName] = useAtom(currentPeerNameAtom);

  const [view, setView] = useState<SetupView>("choose");
  const [gameCode, setGameCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState("");
  const [relayNotConfigured, setRelayNotConfigured] = useState(false);

  // When creator's peer joins, transition to connected
  useEffect(() => {
    if (view !== "waiting") return;

    const cleanup = onPeerJoined((name) => {
      setPeerName(name);
      setLocalColor("white"); // Creator is always white
      setMultiplayerState({ phase: "connected", code: gameCode });
      startHeartbeat();
    });

    const cleanupStatus = watchRelayStatus({
      reconnecting: t("Multiplayer.Reconnecting"),
      reconnected: t("Multiplayer.Reconnected"),
      connectionLost: t("Multiplayer.ConnectionLost"),
    });

    return () => {
      cleanup();
      cleanupStatus();
    };
  }, [view, gameCode, t, setPeerName, setLocalColor, setMultiplayerState]);

  const handleCreate = useCallback(async () => {
    if (!playerName.trim()) return;

    setError("");
    setRelayNotConfigured(false);

    if (!isRelayConfigured()) {
      setError(t("Multiplayer.RelayNotConfigured"));
      setRelayNotConfigured(true);
      return;
    }

    setView("creating");
    setMultiplayerState({ phase: "creating" });

    try {
      connectToRelay();
      // Small delay to ensure connection
      await new Promise((r) => setTimeout(r, 500));

      const { code } = await createGame(playerName);
      setGameCode(code);
      setView("waiting");
      setMultiplayerState({ phase: "waiting", code });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create game");
      setView("choose");
      setMultiplayerState({ phase: "idle" });
    }
  }, [playerName, t, setMultiplayerState]);

  const handleJoin = useCallback(async () => {
    const code = joinCode.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (code.length !== 6 || !playerName.trim()) return;

    const formatted = `${code.slice(0, 2)}-${code.slice(2, 4)}-${code.slice(4, 6)}`;
    setError("");
    setRelayNotConfigured(false);

    if (!isRelayConfigured()) {
      setError(t("Multiplayer.RelayNotConfigured"));
      setRelayNotConfigured(true);
      return;
    }

    setMultiplayerState({ phase: "joining" });

    try {
      connectToRelay();
      await new Promise((r) => setTimeout(r, 500));

      const { color, peerName: peer } = await joinGame(formatted, playerName);
      setPeerName(peer);
      setLocalColor(color);
      setMultiplayerState({ phase: "connected", code: formatted });
      startHeartbeat();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join game");
      setView("joining");
      setMultiplayerState({ phase: "idle" });
    }
  }, [joinCode, playerName, t, setPeerName, setLocalColor, setMultiplayerState]);

  const handleCancel = useCallback(() => {
    disconnectFromRelay();
    setView("choose");
    setGameCode("");
    setJoinCode("");
    setError("");
    setRelayNotConfigured(false);
    setMultiplayerState({ phase: "idle" });
  }, [setMultiplayerState]);

  const openRelaySettings = useCallback(() => {
    navigate({ to: "/settings", search: { tab: "network" } });
  }, [navigate]);

  const errorBlock = error && (
    <Stack gap={4}>
      <Text c="red" size="sm">
        {error}
      </Text>
      {relayNotConfigured && (
        <Button
          size="xs"
          variant="subtle"
          onClick={openRelaySettings}
          style={{ alignSelf: "start" }}
        >
          {t("Multiplayer.OpenSettings")}
        </Button>
      )}
    </Stack>
  );

  // Choose: name + create/join buttons
  if (view === "choose") {
    return (
      <Stack>
        <Text size="lg" fw={600}>
          {t("Multiplayer.Title")}
        </Text>

        <TextInput
          label={t("Multiplayer.YourName")}
          value={playerName}
          onChange={(e) => setPlayerName(e.currentTarget.value)}
          placeholder="Player"
        />

        {errorBlock}

        <Group grow>
          <Button onClick={handleCreate} disabled={!playerName.trim()}>
            {t("Multiplayer.CreateGame")}
          </Button>
          <Button variant="light" onClick={() => setView("joining")} disabled={!playerName.trim()}>
            {t("Multiplayer.JoinGame")}
          </Button>
        </Group>
      </Stack>
    );
  }

  // Creating: spinner
  if (view === "creating") {
    return (
      <Stack align="center" justify="center" h="100%">
        <Loader size="lg" />
        <Text c="dimmed">{t("Multiplayer.Creating")}</Text>
      </Stack>
    );
  }

  // Waiting: show code, waiting for opponent
  if (view === "waiting") {
    return (
      <Stack align="center" gap="lg">
        <Text size="lg" fw={600}>
          {t("Multiplayer.ShareCode")}
        </Text>

        <Group gap="xs">
          <Code
            style={{
              fontSize: "2rem",
              padding: "0.5rem 1rem",
              letterSpacing: "0.15em",
            }}
          >
            {gameCode}
          </Code>
          <CopyButton value={gameCode} timeout={2000}>
            {({ copied, copy }) => (
              <Tooltip label={copied ? t("Common.Copied") : "Copy"}>
                <ActionIcon color={copied ? "teal" : "gray"} variant="subtle" onClick={copy}>
                  {copied ? <IconCheck size="1rem" /> : <IconCopy size="1rem" />}
                </ActionIcon>
              </Tooltip>
            )}
          </CopyButton>
        </Group>

        <Group gap="xs">
          <Loader size="sm" />
          <Text c="dimmed">{t("Multiplayer.WaitingForOpponent")}</Text>
        </Group>

        <Button variant="subtle" color="gray" onClick={handleCancel}>
          {t("Common.Cancel")}
        </Button>
      </Stack>
    );
  }

  // Joining: code input
  if (view === "joining") {
    return (
      <Stack>
        <Text size="lg" fw={600}>
          {t("Multiplayer.EnterCode")}
        </Text>

        <PinInput
          length={6}
          placeholder=""
          value={joinCode}
          onChange={setJoinCode}
          type="alphanumeric"
          size="lg"
          oneTimeCode
          styles={{ input: { textTransform: "uppercase" } }}
        />

        {errorBlock}

        <Group>
          <Button
            onClick={handleJoin}
            disabled={joinCode.replace(/[^a-zA-Z0-9]/g, "").length !== 6}
          >
            {t("Multiplayer.Join")}
          </Button>
          <Button variant="subtle" color="gray" onClick={handleCancel}>
            {t("Common.Cancel")}
          </Button>
        </Group>
      </Stack>
    );
  }

  return null;
}
