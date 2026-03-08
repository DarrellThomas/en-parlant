import {
  ActionIcon,
  Button,
  Card,
  Group,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { useHotkeys } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  IconBook,
  IconBrush,
  IconChess,
  IconFlag,
  IconFolder,
  IconKeyboard,
  IconMessageCircle,
  IconMouse,
  IconNetwork,
  IconReload,
  IconSearch,
  IconShield,
  IconVolume,
} from "@tabler/icons-react";
import { useLoaderData, useSearch } from "@tanstack/react-router";
import { open } from "@tauri-apps/plugin-dialog";
import { useAtom, useSetAtom } from "jotai";
import { RESET } from "jotai/utils";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  autoPromoteAtom,
  autoSaveAtom,
  enableBoardScrollAtom,
  eraseDrawablesOnClickAtom,
  forcedEnPassantAtom,
  materialDisplayAtom,
  moveHighlightAtom,
  moveInputAtom,
  moveMethodAtom,
  moveNotationTypeAtom,
  lichessIncludeUnratedAtom,
  nativeBarAtom,
  playerNameAtom,
  previewBoardOnHoverAtom,
  ranksPositionAtom,
  relayUrlAtom,
  showArrowsAtom,
  showConsecutiveArrowsAtom,
  showCoordinatesAtom,
  showDestsAtom,
  showVariationArrowsAtom,
  snapArrowsAtom,
  spellCheckAtom,
  storedDatabasesDirAtom,
  storedDocumentDirAtom,
  storedEnginesDirAtom,
  storedPuzzlesDirAtom,
  ttsLanguageAtom,
} from "@/state/atoms";
import { keyMapAtom } from "@/state/keybinds";
import FileInput from "../common/FileInput";
import BoardSelect from "./BoardSelect";
import ColorControl from "./ColorControl";
import FontSizeSlider from "./FontSizeSlider";
import KeybindInput from "./KeybindInput";
import PiecesSelect from "./PiecesSelect";
import RepertoireMinGamesSetting from "./RepertoireMinGamesSetting";
import * as classes from "./SettingsPage.css";
import SettingsSwitch from "./SettingsSwitch";
import SoundSelect from "./SoundSelect";
import ThemeButton from "./ThemeButton";
import {
  TTSApiKeyInput,
  TTSAutoNarrateSwitch,
  TTSClearCacheButton,
  TTSEnabledSwitch,
  TTSGoogleApiKeyInput,
  TTSKittenTTSThreadsInput,
  TTSKittenTTSUrlInput,
  TTSLanguageSelect,
  TTSOpenTTSUrlInput,
  TTSProviderSelect,
  TTSSetupButton,
  TTSSpeedSlider,
  TTSVoiceSelect,
  TTSVolumeSlider,
} from "./TTSSettings";
import VolumeSlider from "./VolumeSlider";

// Hardcoded language data for the rescue banner and undo toast.
// These are NOT translated via i18n — they must always be readable
// regardless of the current UI language.
const LANGUAGE_RESCUE = [
  { value: "en-US", native: "English (US)" },
  { value: "en-GB", native: "English (UK)" },
  { value: "es-ES", native: "Español" },
  { value: "hi-IN", native: "हिन्दी" },
  { value: "ru-RU", native: "Русский" },
  { value: "de-DE", native: "Deutsch" },
  { value: "fr-FR", native: "Français" },
  { value: "pt-PT", native: "Português" },
  { value: "pl-PL", native: "Polski" },
  { value: "it-IT", native: "Italiano" },
  { value: "uk-UA", native: "Українська" },
  { value: "tr-TR", native: "Türkçe" },
  { value: "ko-KR", native: "한국어" },
  { value: "zh-CN", native: "中文（简体）" },
  { value: "zh-TW", native: "中文（繁體）" },
  { value: "nb-NO", native: "Norsk bokmål" },
  { value: "be-BY", native: "Беларуская" },
] as const;

// Undo messages in each language (shown in the PREVIOUS language after switching)
const UNDO_MESSAGES: Record<string, { changed: string; undo: string }> = {
  "en-US": { changed: "Language changed.", undo: "Undo" },
  "en-GB": { changed: "Language changed.", undo: "Undo" },
  "es-ES": { changed: "Idioma cambiado.", undo: "Deshacer" },
  "hi-IN": { changed: "भाषा बदली गई।", undo: "पूर्ववत करें" },
  "ru-RU": { changed: "Язык изменён.", undo: "Отменить" },
  "de-DE": { changed: "Sprache geändert.", undo: "Rückgängig" },
  "fr-FR": { changed: "Langue modifiée.", undo: "Annuler" },
  "pt-PT": { changed: "Idioma alterado.", undo: "Desfazer" },
  "pl-PL": { changed: "Język zmieniony.", undo: "Cofnij" },
  "it-IT": { changed: "Lingua cambiata.", undo: "Annulla" },
  "uk-UA": { changed: "Мову змінено.", undo: "Скасувати" },
  "tr-TR": { changed: "Dil değiştirildi.", undo: "Geri al" },
  "ko-KR": { changed: "언어가 변경되었습니다.", undo: "실행 취소" },
  "zh-CN": { changed: "语言已更改。", undo: "撤消" },
  "zh-TW": { changed: "語言已更改。", undo: "復原" },
  "nb-NO": { changed: "Språk endret.", undo: "Angre" },
  "be-BY": { changed: "Мова зменена.", undo: "Адмяніць" },
};

// "Language" in every supported language — used for tooltip and sidebar
const LANGUAGE_WORD_ALL = [
  "Language",
  "Idioma",
  "भाषा",
  "Язык",
  "Sprache",
  "Langue",
  "Idioma",
  "Język",
  "Lingua",
  "Мова",
  "Dil",
  "언어",
  "语言",
  "語言",
  "Språk",
  "Мова",
].join(" · ");

type SettingCategory =
  | "board"
  | "inputs"
  | "anarchy"
  | "appearance"
  | "language"
  | "sound"
  | "keybinds"
  | "directories"
  | "repertoire"
  | "tts"
  | "network"
  | "privacy";

interface SettingItem {
  id: string;
  category: SettingCategory;
  title: string;
  description: string;
  keywords?: string[];
  render: () => React.ReactNode;
}

function SettingRow({
  title,
  description,
  children,
  highlight,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <Group
      justify="space-between"
      wrap="nowrap"
      gap="xl"
      className={classes.item}
      style={
        highlight
          ? { backgroundColor: "var(--mantine-color-yellow-light)" }
          : undefined
      }
    >
      <div>
        <Text>{title}</Text>
        <Text size="xs" c="dimmed">
          {description}
        </Text>
      </div>
      {children}
    </Group>
  );
}

function PrivacyStatement() {
  return (
    <Stack gap="md">
      <Text size="lg" fw={600}>
        We respect your privacy.
      </Text>
      <Text size="sm">
        We do not collect any telemetry data. Zero. Nada. Zilch. Rien. Niente.
        Nichts. Nul. Ничего. ゼロ. 零. 제로.
      </Text>
      <Text size="sm" c="dimmed">
        If you run into issues and want to share your data to help us improve,
        you know where to find us.
      </Text>
    </Stack>
  );
}

export default function Page() {
  const { t, i18n } = useTranslation();
  const { tab: initialTab } = useSearch({ from: "/settings" });
  const [activeTab, setActiveTab] = useState(initialTab || "board");
  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [keyMap, setKeyMap] = useAtom(keyMapAtom);
  const [isNative, setIsNative] = useAtom(nativeBarAtom);
  const {
    dirs: {
      documentDir,
      databasesDir: defaultDatabasesDir,
      enginesDir: defaultEnginesDir,
      puzzlesDir: defaultPuzzlesDir,
    },
    version,
  } = useLoaderData({ from: "/settings" });
  let [filesDirectory, setFilesDirectory] = useAtom(storedDocumentDirAtom);
  filesDirectory = filesDirectory || documentDir;
  let [databasesDirectory, setDatabasesDirectory] = useAtom(
    storedDatabasesDirAtom,
  );
  databasesDirectory = databasesDirectory || defaultDatabasesDir;
  let [enginesDirectory, setEnginesDirectory] = useAtom(storedEnginesDirAtom);
  enginesDirectory = enginesDirectory || defaultEnginesDir;
  let [puzzlesDirectory, setPuzzlesDirectory] = useAtom(storedPuzzlesDirAtom);
  puzzlesDirectory = puzzlesDirectory || defaultPuzzlesDir;

  const [relayUrl, setRelayUrl] = useAtom(relayUrlAtom);
  const [mpPlayerName, setMpPlayerName] = useAtom(playerNameAtom);

  const [moveMethod, setMoveMethod] = useAtom(moveMethodAtom);
  const [moveNotationType, setMoveNotationType] = useAtom(moveNotationTypeAtom);
  const [showCoordinates, setShowCoordinates] = useAtom(showCoordinatesAtom);
  const [ranksPosition, setRanksPosition] = useAtom(ranksPositionAtom);
  const [materialDisplay, setMaterialDisplay] = useAtom(materialDisplayAtom);
  const setTtsLanguage = useSetAtom(ttsLanguageAtom);

  const settings: SettingItem[] = useMemo(
    () => [
      // Board settings
      {
        id: "piece-dest",
        category: "board",
        title: t("Settings.PieceDest"),
        description: t("Settings.PieceDest.Desc"),
        keywords: ["destination", "moves", "highlight"],
        render: () => <SettingsSwitch atom={showDestsAtom} />,
      },
      {
        id: "move-highlight",
        category: "board",
        title: t("Settings.MoveHighlight"),
        description: t("Settings.MoveHighlight.Desc"),
        keywords: ["highlight", "last move"],
        render: () => <SettingsSwitch atom={moveHighlightAtom} />,
      },
      {
        id: "arrows",
        category: "board",
        title: t("Settings.Arrows"),
        description: t("Settings.Arrows.Desc"),
        keywords: ["arrows", "analysis"],
        render: () => <SettingsSwitch atom={showArrowsAtom} />,
      },
      {
        id: "variation-arrows",
        category: "board",
        title: t("Settings.VariationArrows"),
        description: t("Settings.VariationArrows.Desc"),
        keywords: ["arrows", "variations", "alternative"],
        render: () => <SettingsSwitch atom={showVariationArrowsAtom} />,
      },
      {
        id: "move-notation",
        category: "board",
        title: t("Settings.MoveNotation"),
        description: t("Settings.MoveNotation.Desc"),
        keywords: ["notation", "letters", "symbols", "pieces"],
        render: () => (
          <Select
            data={[
              { label: t("Settings.MoveNotation.Letters"), value: "letters" },
              { label: t("Settings.MoveNotation.Symbols"), value: "symbols" },
            ]}
            allowDeselect={false}
            value={moveNotationType}
            onChange={(val) =>
              setMoveNotationType(val as "letters" | "symbols")
            }
          />
        ),
      },
      {
        id: "move-method",
        category: "board",
        title: t("Settings.MoveMethod"),
        description: t("Settings.MoveMethod.Desc"),
        keywords: ["drag", "click", "move", "pieces"],
        render: () => (
          <Select
            data={[
              { label: t("Settings.MoveMethod.Drag"), value: "drag" },
              { label: t("Settings.MoveMethod.Click"), value: "select" },
              { label: t("Settings.MoveMethod.Both"), value: "both" },
            ]}
            allowDeselect={false}
            value={moveMethod}
            onChange={(val) => setMoveMethod(val as "drag" | "select" | "both")}
          />
        ),
      },
      {
        id: "snap-arrows",
        category: "board",
        title: t("Settings.SnapArrows"),
        description: t("Settings.SnapArrows.Desc"),
        keywords: ["arrows", "snap"],
        render: () => <SettingsSwitch atom={snapArrowsAtom} />,
      },
      {
        id: "consecutive-arrows",
        category: "board",
        title: t("Settings.ConsecutiveArrows"),
        description: t("Settings.ConsecutiveArrows.Desc"),
        keywords: ["arrows", "consecutive"],
        render: () => <SettingsSwitch atom={showConsecutiveArrowsAtom} />,
      },
      {
        id: "erase-drawables",
        category: "board",
        title: t("Settings.EraseDrawablesOnClick"),
        description: t("Settings.EraseDrawablesOnClick.Desc"),
        keywords: ["erase", "drawables", "click", "arrows"],
        render: () => <SettingsSwitch atom={eraseDrawablesOnClickAtom} />,
      },
      {
        id: "auto-promote",
        category: "board",
        title: t("Settings.AutoPromition"),
        description: t("Settings.AutoPromition.Desc"),
        keywords: ["promote", "queen", "pawn"],
        render: () => <SettingsSwitch atom={autoPromoteAtom} />,
      },
      {
        id: "coordinates",
        category: "board",
        title: t("Settings.Coordinates"),
        description: t("Settings.Coordinates.Desc"),
        keywords: ["coordinates", "a-h", "1-8"],
        render: () => (
          <Select
            data={[
              { label: t("Settings.Coordinates.None"), value: "no" },
              { label: t("Settings.Coordinates.Edge"), value: "edge" },
              { label: t("Settings.Coordinates.All"), value: "all" },
            ]}
            allowDeselect={false}
            value={showCoordinates}
            onChange={(val) => setShowCoordinates(val as "no" | "edge" | "all")}
          />
        ),
      },
      {
        id: "ranks-position",
        category: "board",
        title: "Rank Position",
        description:
          "Show rank numbers (1-8) on the left or right side of the board",
        keywords: ["coordinates", "ranks", "position", "left", "right"],
        render: () => (
          <Select
            data={[
              { label: "Left", value: "left" },
              { label: "Right", value: "right" },
            ]}
            allowDeselect={false}
            value={ranksPosition}
            onChange={(val) => setRanksPosition(val as "left" | "right")}
          />
        ),
      },
      {
        id: "auto-save",
        category: "board",
        title: t("Settings.AutoSave"),
        description: t("Settings.AutoSave.Desc"),
        keywords: ["save", "auto"],
        render: () => <SettingsSwitch atom={autoSaveAtom} />,
      },
      {
        id: "preview-board",
        category: "board",
        title: t("Settings.PreviewBoard"),
        description: t("Settings.PreviewBoard.Desc"),
        keywords: ["preview", "hover"],
        render: () => <SettingsSwitch atom={previewBoardOnHoverAtom} />,
      },
      {
        id: "scroll-moves",
        category: "board",
        title: t("Settings.ScrollThroughMoves"),
        description: t("Settings.ScrollThroughMoves.Desc"),
        keywords: ["scroll", "moves", "wheel"],
        render: () => <SettingsSwitch atom={enableBoardScrollAtom} />,
      },
      {
        id: "material-display",
        category: "board",
        title: t("Settings.MaterialDisplay"),
        description: t("Settings.MaterialDisplay.Desc"),
        keywords: ["material", "captured", "pieces", "difference"],
        render: () => (
          <Select
            data={[
              { label: t("Settings.MaterialDisplay.Diff"), value: "diff" },
              { label: t("Settings.MaterialDisplay.All"), value: "all" },
            ]}
            allowDeselect={false}
            value={materialDisplay}
            onChange={(val) => setMaterialDisplay(val as "diff" | "all")}
          />
        ),
      },
      // Input settings
      {
        id: "text-input",
        category: "inputs",
        title: t("Settings.Inputs.TextInput"),
        description: t("Settings.Inputs.TextInput.Desc"),
        keywords: ["text", "input", "type"],
        render: () => <SettingsSwitch atom={moveInputAtom} />,
      },
      {
        id: "spell-check",
        category: "inputs",
        title: t("Settings.Inputs.SpellCheck"),
        description: t("Settings.Inputs.SpellCheck.Desc"),
        keywords: ["spell", "check", "grammar"],
        render: () => <SettingsSwitch atom={spellCheckAtom} />,
      },
      // Anarchy settings
      {
        id: "forced-en-passant",
        category: "anarchy",
        title: t("Settings.Anarchy.ForcedEnCroissant"),
        description: t("Settings.Anarchy.ForcedEnCroissant.Desc"),
        keywords: ["en passant", "forced", "croissant"],
        render: () => <SettingsSwitch atom={forcedEnPassantAtom} />,
      },
      // Appearance settings
      {
        id: "theme",
        category: "appearance",
        title: t("Settings.Appearance.Theme"),
        description: t("Settings.Appearance.Theme.Desc"),
        keywords: ["theme", "dark", "light", "color"],
        render: () => <ThemeButton />,
      },
      ...(import.meta.env.VITE_PLATFORM === "win32"
        ? [
            {
              id: "title-bar",
              category: "appearance" as SettingCategory,
              title: t("Settings.Appearance.TitleBar"),
              description: t("Settings.Appearance.TitleBar.Desc"),
              keywords: ["title", "bar", "native", "custom"],
              render: () => (
                <Select
                  allowDeselect={false}
                  data={[
                    {
                      value: "Native",
                      label: t("Settings.Appearance.TitleBar.Native"),
                    },
                    {
                      value: "Custom",
                      label: t("Settings.Appearance.TitleBar.Custom"),
                    },
                  ]}
                  value={isNative ? "Native" : "Custom"}
                  onChange={(val) => setIsNative(val === "Native")}
                />
              ),
            },
          ]
        : []),
      {
        id: "font-size",
        category: "appearance",
        title: t("Settings.Appearance.FontSize"),
        description: t("Settings.Appearance.FontSize.Desc"),
        keywords: ["font", "size", "text"],
        render: () => <FontSizeSlider />,
      },
      {
        id: "piece-set",
        category: "appearance",
        title: t("Settings.Appearance.PieceSet"),
        description: t("Settings.Appearance.PieceSet.Desc"),
        keywords: ["piece", "set", "style"],
        render: () => <PiecesSelect />,
      },
      {
        id: "board-image",
        category: "appearance",
        title: t("Settings.Appearance.BoardImage"),
        description: t("Settings.Appearance.BoardImage.Desc"),
        keywords: ["board", "image", "texture"],
        render: () => <BoardSelect />,
      },
      {
        id: "accent-color",
        category: "appearance",
        title: t("Settings.Appearance.AccentColor"),
        description: t("Settings.Appearance.AccentColor.Desc"),
        keywords: ["accent", "color", "primary"],
        render: () => (
          <div style={{ width: 200 }}>
            <ColorControl />
          </div>
        ),
      },
      // Repertoire settings
      {
        id: "repertoire-depth",
        category: "repertoire",
        title: t("Settings.Repertoire.Depth"),
        description: t("Settings.Repertoire.Depth.Desc"),
        keywords: ["repertoire", "depth", "games", "min"],
        render: () => <RepertoireMinGamesSetting />,
      },
      // Sound settings
      {
        id: "volume",
        category: "sound",
        title: t("Settings.Sound.Volume"),
        description: t("Settings.Sound.Volume.Desc"),
        keywords: ["volume", "audio", "loud"],
        render: () => <VolumeSlider />,
      },
      {
        id: "sound-collection",
        category: "sound",
        title: t("Settings.Sound.Collection"),
        description: t("Settings.Sound.Collection.Desc"),
        keywords: ["sound", "collection", "audio", "effects"],
        render: () => <SoundSelect />,
      },
      // TTS settings
      {
        id: "tts-enabled",
        category: "tts",
        title: "Text-to-Speech",
        description:
          "Enable text-to-speech narration for PGN annotations and comments",
        keywords: ["tts", "speech", "narrate", "elevenlabs", "voice", "read"],
        render: () => <TTSEnabledSwitch />,
      },
      {
        id: "tts-auto-narrate",
        category: "tts",
        title: "Auto-Narrate on Move",
        description:
          "Automatically read annotations aloud when stepping through moves",
        keywords: ["tts", "auto", "narrate", "step", "move"],
        render: () => <TTSAutoNarrateSwitch />,
      },
      {
        id: "tts-provider",
        category: "tts",
        title: "TTS Provider",
        description:
          "En Parlant Cloud Clips (instant, no setup), ElevenLabs (premium AI), Google Cloud (WaveNet), KittenTTS (English only, high quality), OpenTTS (self-hosted), or System (OS native)",
        keywords: [
          "tts",
          "provider",
          "elevenlabs",
          "google",
          "cloud",
          "opentts",
          "kittentts",
          "system",
          "engine",
        ],
        render: () => <TTSProviderSelect />,
      },
      {
        id: "tts-setup",
        category: "tts",
        title: "TTS Setup",
        description:
          "Check and install dependencies for local TTS providers (KittenTTS, OpenTTS)",
        keywords: [
          "tts",
          "setup",
          "install",
          "docker",
          "python",
          "dependencies",
          "venv",
        ],
        render: () => <TTSSetupButton />,
      },
      {
        id: "tts-voice",
        category: "tts",
        title: "TTS Voice",
        description:
          "Select the voice for narration. Options change based on the provider selected above.",
        keywords: ["tts", "voice", "select", "elevenlabs"],
        render: () => <TTSVoiceSelect />,
      },
      {
        id: "tts-language",
        category: "tts",
        title: "TTS Language",
        description:
          "Language for narration. Chess terms are translated; comments are spoken in this language.",
        keywords: [
          "tts",
          "language",
          "french",
          "spanish",
          "german",
          "japanese",
          "russian",
          "chinese",
        ],
        render: () => <TTSLanguageSelect />,
      },
      {
        id: "tts-volume",
        category: "tts",
        title: "TTS Volume",
        description: "Volume level for text-to-speech narration",
        keywords: ["tts", "volume", "loud"],
        render: () => <TTSVolumeSlider />,
      },
      {
        id: "tts-speed",
        category: "tts",
        title: "TTS Speed",
        description:
          "Playback speed for narration. Adjusts in real-time without re-generating audio.",
        keywords: ["tts", "speed", "rate", "fast", "slow", "playback"],
        render: () => <TTSSpeedSlider />,
      },
      {
        id: "tts-clear-cache",
        category: "tts",
        title: "TTS Audio Cache",
        description:
          "Clear cached narration audio. Use this after editing annotations to force re-generation.",
        keywords: ["tts", "cache", "clear", "reset", "audio"],
        render: () => <TTSClearCacheButton />,
      },
      {
        id: "tts-api-key",
        category: "tts",
        title: "ElevenLabs API Key",
        description:
          "API key for ElevenLabs provider. Get one at elevenlabs.io",
        keywords: ["tts", "api", "key", "elevenlabs"],
        render: () => <TTSApiKeyInput />,
      },
      {
        id: "tts-google-api-key",
        category: "tts",
        title: "Google Cloud API Key",
        description:
          "API key for Google Cloud TTS provider. Enable the Text-to-Speech API in Google Cloud Console",
        keywords: ["tts", "api", "key", "google", "cloud"],
        render: () => <TTSGoogleApiKeyInput />,
      },
      {
        id: "tts-opentts-url",
        category: "tts",
        title: "OpenTTS Server URL",
        description:
          "URL of your OpenTTS server (e.g. http://localhost:5500). Run with: docker run -it -p 5500:5500 synesthesiam/opentts:en",
        keywords: [
          "tts",
          "opentts",
          "server",
          "url",
          "self-hosted",
          "docker",
          "start",
          "stop",
        ],
        render: () => <TTSOpenTTSUrlInput />,
      },
      {
        id: "tts-kittentts-url",
        category: "tts",
        title: "KittenTTS Server URL",
        description:
          "URL of your KittenTTS server (English only). High-quality StyleTTS 2 voices. See TTS > Getting Started for setup.",
        keywords: [
          "tts",
          "kittentts",
          "server",
          "url",
          "kitten",
          "styletts",
          "start",
          "stop",
        ],
        render: () => <TTSKittenTTSUrlInput />,
      },
      {
        id: "tts-kittentts-threads",
        category: "tts",
        title: "KittenTTS CPU Threads",
        description:
          "Number of CPU threads for KittenTTS inference. 0 = auto (~4 threads). Increase for faster generation on machines with many cores. Restart server to apply.",
        keywords: [
          "tts",
          "kittentts",
          "threads",
          "cpu",
          "cores",
          "performance",
        ],
        render: () => <TTSKittenTTSThreadsInput />,
      },
      // Directories settings
      {
        id: "files-directory",
        category: "directories",
        title: t("Settings.Directories.Files"),
        description: t("Settings.Directories.Files.Desc"),
        keywords: ["files", "directory", "folder", "path"],
        render: () => (
          <FileInput
            onClick={async () => {
              const selected = await open({
                multiple: false,
                directory: true,
              });
              if (!selected || typeof selected !== "string") return;
              setFilesDirectory(selected);
            }}
            filename={filesDirectory || null}
          />
        ),
      },
      {
        id: "databases-directory",
        category: "directories",
        title: t("Settings.Directories.Databases"),
        description: t("Settings.Directories.Databases.Desc"),
        keywords: ["databases", "directory", "folder", "path"],
        render: () => (
          <FileInput
            onClick={async () => {
              const selected = await open({
                multiple: false,
                directory: true,
              });
              if (!selected || typeof selected !== "string") return;
              setDatabasesDirectory(selected);
            }}
            filename={databasesDirectory || null}
          />
        ),
      },
      {
        id: "engines-directory",
        category: "directories",
        title: t("Settings.Directories.Engines"),
        description: t("Settings.Directories.Engines.Desc"),
        keywords: ["engines", "directory", "folder", "path"],
        render: () => (
          <FileInput
            onClick={async () => {
              const selected = await open({
                multiple: false,
                directory: true,
              });
              if (!selected || typeof selected !== "string") return;
              setEnginesDirectory(selected);
            }}
            filename={enginesDirectory || null}
          />
        ),
      },
      {
        id: "puzzles-directory",
        category: "directories",
        title: t("Settings.Directories.Puzzles"),
        description: t("Settings.Directories.Puzzles.Desc"),
        keywords: ["puzzles", "directory", "folder", "path"],
        render: () => (
          <FileInput
            onClick={async () => {
              const selected = await open({
                multiple: false,
                directory: true,
              });
              if (!selected || typeof selected !== "string") return;
              setPuzzlesDirectory(selected);
            }}
            filename={puzzlesDirectory || null}
          />
        ),
      },
      // Network settings (Multiplayer)
      {
        id: "relay-url",
        category: "network",
        title: t("Settings.Network.RelayUrl"),
        description: t("Settings.Network.RelayUrl.Desc"),
        keywords: ["relay", "server", "url", "multiplayer", "websocket"],
        render: () => (
          <TextInput
            value={relayUrl}
            onChange={(e) => setRelayUrl(e.currentTarget.value)}
            placeholder="wss://your-relay-server.example.com"
            style={{ width: 250 }}
          />
        ),
      },
      {
        id: "player-name",
        category: "network",
        title: t("Settings.Network.PlayerName"),
        description: t("Settings.Network.PlayerName.Desc"),
        keywords: ["player", "name", "multiplayer", "username"],
        render: () => (
          <TextInput
            value={mpPlayerName}
            onChange={(e) => setMpPlayerName(e.currentTarget.value)}
            placeholder="Player"
            style={{ width: 200 }}
          />
        ),
      },
      {
        id: "lichess-include-unrated",
        category: "inputs",
        title: t("Settings.Inputs.LichessIncludeUnrated"),
        description: t("Settings.Inputs.LichessIncludeUnrated.Desc"),
        keywords: ["lichess", "unrated", "casual", "games", "download"],
        render: () => <SettingsSwitch atom={lichessIncludeUnratedAtom} />,
      },
      // Privacy settings
      {
        id: "privacy-statement",
        category: "privacy",
        title: "",
        description: "",
        keywords: ["privacy", "telemetry", "data"],
        render: () => <PrivacyStatement />,
      },
    ],
    [
      t,
      moveNotationType,
      moveMethod,
      isNative,
      showCoordinates,
      ranksPosition,
      materialDisplay,
      filesDirectory,
      databasesDirectory,
      enginesDirectory,
      puzzlesDirectory,
      setMoveNotationType,
      setMoveMethod,
      setIsNative,
      setFilesDirectory,
      setDatabasesDirectory,
      setEnginesDirectory,
      setPuzzlesDirectory,
      setShowCoordinates,
      setRanksPosition,
      setMaterialDisplay,
      relayUrl,
      setRelayUrl,
      mpPlayerName,
      setMpPlayerName,
    ],
  );

  useHotkeys([["mod+f", () => searchInputRef.current?.focus()]]);

  const categoryInfo: Record<
    SettingCategory,
    { title: string; description: string; icon: React.ReactNode }
  > = useMemo(
    () => ({
      board: {
        title: t("Settings.Board"),
        description: t("Settings.Board.Desc"),
        icon: <IconChess size="1rem" />,
      },
      inputs: {
        title: t("Settings.Inputs"),
        description: t("Settings.Inputs.Desc"),
        icon: <IconMouse size="1rem" />,
      },
      anarchy: {
        title: t("Settings.Anarchy"),
        description: t("Settings.Anarchy.Desc"),
        icon: <IconFlag size="1rem" />,
      },
      appearance: {
        title: t("Settings.Appearance"),
        description: t("Settings.Appearance.Desc"),
        icon: <IconBrush size="1rem" />,
      },
      language: {
        title: t("Settings.Language"),
        description: t("Settings.Language.Desc"),
        icon: <span style={{ fontSize: "1rem" }}>🌐</span>,
      },
      sound: {
        title: t("Settings.Sound"),
        description: t("Settings.Sound.Desc"),
        icon: <IconVolume size="1rem" />,
      },
      tts: {
        title: t("Settings.TTS"),
        description: t("Settings.TTS.Desc"),
        icon: <IconMessageCircle size="1rem" />,
      },
      keybinds: {
        title: t("Settings.Keybinds"),
        description: t("Settings.Keybinds.Desc"),
        icon: <IconKeyboard size="1rem" />,
      },
      directories: {
        title: t("Settings.Directories"),
        description: t("Settings.Directories.Desc"),
        icon: <IconFolder size="1rem" />,
      },
      repertoire: {
        title: t("Settings.Repertoire"),
        description: t("Settings.Repertoire.Desc"),
        icon: <IconBook size="1rem" />,
      },
      network: {
        title: t("Settings.Network"),
        description: t("Settings.Network.Desc"),
        icon: <IconNetwork size="1rem" />,
      },
      privacy: {
        title: t("Settings.Privacy"),
        description: t("Settings.Privacy.Desc"),
        icon: <IconShield size="1rem" />,
      },
    }),
    [t],
  );

  const filteredSettings = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const query = searchQuery.toLowerCase();
    return settings.filter(
      (setting) =>
        setting.title.toLowerCase().includes(query) ||
        setting.description.toLowerCase().includes(query) ||
        categoryInfo[setting.category].title.toLowerCase().includes(query) ||
        setting.id.toLowerCase().includes(query) ||
        setting.keywords?.some((kw) => kw.toLowerCase().includes(query)),
    );
  }, [searchQuery, settings, categoryInfo]);

  const renderSearchResults = () => {
    if (!filteredSettings) return null;

    if (filteredSettings.length === 0) {
      return (
        <Card withBorder p="lg" className={classes.card} w="100%">
          <Text c="dimmed" ta="center">
            No settings found for "{searchQuery}"
          </Text>
        </Card>
      );
    }

    // Group filtered settings by category
    const groupedSettings = filteredSettings.reduce(
      (acc, setting) => {
        if (!acc[setting.category]) {
          acc[setting.category] = [];
        }
        acc[setting.category].push(setting);
        return acc;
      },
      {} as Record<SettingCategory, SettingItem[]>,
    );

    return (
      <Card withBorder p="lg" className={classes.card} w="100%">
        {Object.entries(groupedSettings).map(([category, categorySettings]) => (
          <div key={category}>
            <Group gap="xs" mt="md" mb="xs">
              {categoryInfo[category as SettingCategory].icon}
              <Text fw={500} size="sm" c="dimmed">
                {categoryInfo[category as SettingCategory].title}
              </Text>
            </Group>
            {categorySettings.map((setting) => (
              <SettingRow
                key={setting.id}
                title={setting.title}
                description={setting.description}
              >
                {setting.render()}
              </SettingRow>
            ))}
          </div>
        ))}
      </Card>
    );
  };

  const renderCategorySettings = (category: SettingCategory) => {
    const categorySettings = settings.filter((s) => s.category === category);
    return categorySettings.map((setting) => (
      <SettingRow
        key={setting.id}
        title={setting.title}
        description={setting.description}
      >
        {setting.render()}
      </SettingRow>
    ));
  };

  return (
    <Stack h="100%" gap={0}>
      <Group px="md" pt="md" pb="sm">
        <TextInput
          ref={searchInputRef}
          placeholder="Search settings..."
          leftSection={<IconSearch size="1rem" />}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "f" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
            }
            if (e.key === "Escape") {
              setSearchQuery("");
              searchInputRef.current?.blur();
            }
          }}
          style={{ flex: 1, maxWidth: 400 }}
        />
      </Group>
      {filteredSettings ? (
        <ScrollArea flex={1} px="md">
          {renderSearchResults()}
          <Text size="xs" c="dimmed" ta="right" py="md">
            En Parlant~ v{version}
          </Text>
        </ScrollArea>
      ) : (
        <Tabs
          value={activeTab}
          onChange={(v) => v && setActiveTab(v)}
          orientation="vertical"
          flex={1}
          style={{ overflow: "hidden" }}
          styles={{
            tabLabel: {
              textAlign: "left",
            },
          }}
        >
          <Tabs.List h="100%">
            <Tabs.Tab value="board" leftSection={<IconChess size="1rem" />}>
              {t("Settings.Board")}
            </Tabs.Tab>
            <Tabs.Tab value="inputs" leftSection={<IconMouse size="1rem" />}>
              {t("Settings.Inputs")}
            </Tabs.Tab>
            <Tabs.Tab value="anarchy" leftSection={<IconFlag size="1rem" />}>
              {t("Settings.Anarchy")}
            </Tabs.Tab>
            <Tabs.Tab
              value="appearance"
              leftSection={<IconBrush size="1rem" />}
            >
              {t("Settings.Appearance")}
            </Tabs.Tab>
            <Tabs.Tab value="sound" leftSection={<IconVolume size="1rem" />}>
              {t("Settings.Sound")}
            </Tabs.Tab>
            <Tabs.Tab
              value="tts"
              leftSection={<IconMessageCircle size="1rem" />}
            >
              {t("Settings.TTS")}
            </Tabs.Tab>
            <Tabs.Tab
              value="keybinds"
              leftSection={<IconKeyboard size="1rem" />}
            >
              {t("Settings.Keybinds")}
            </Tabs.Tab>
            <Tabs.Tab
              value="directories"
              leftSection={<IconFolder size="1rem" />}
            >
              {t("Settings.Directories")}
            </Tabs.Tab>
            <Tabs.Tab value="repertoire" leftSection={<IconBook size="1rem" />}>
              {t("Settings.Repertoire")}
            </Tabs.Tab>
            <Tabs.Tab value="network" leftSection={<IconNetwork size="1rem" />}>
              {t("Settings.Network")}
            </Tabs.Tab>
            <Tooltip
              label={LANGUAGE_WORD_ALL}
              position="right"
              multiline
              w={280}
            >
              <Tabs.Tab
                value="language"
                leftSection={<span style={{ fontSize: "1rem" }}>🌐</span>}
              >
                {t("Settings.Language")}
              </Tabs.Tab>
            </Tooltip>
            <Tabs.Tab value="privacy" leftSection={<IconShield size="1rem" />}>
              {t("Settings.Privacy")}
            </Tabs.Tab>
          </Tabs.List>
          <Stack flex={1} px="md">
            <ScrollArea>
              <Card withBorder p="lg" className={classes.card} w="100%">
                <Tabs.Panel value="board">
                  <Text size="lg" fw={500} className={classes.title}>
                    {t("Settings.Board")}
                  </Text>
                  <Text size="xs" c="dimmed" mt={3} mb="lg">
                    {t("Settings.Board.Desc")}
                  </Text>
                  {renderCategorySettings("board")}
                </Tabs.Panel>

                <Tabs.Panel value="inputs">
                  <Text size="lg" fw={500} className={classes.title}>
                    {t("Settings.Inputs")}
                  </Text>
                  <Text size="xs" c="dimmed" mt={3} mb="lg">
                    {t("Settings.Inputs.Desc")}
                  </Text>
                  {renderCategorySettings("inputs")}
                </Tabs.Panel>

                <Tabs.Panel value="anarchy">
                  <Text size="lg" fw={500} className={classes.title}>
                    {t("Settings.Anarchy")}
                  </Text>
                  <Text size="xs" c="dimmed" mt={3} mb="lg">
                    {t("Settings.Anarchy.Desc")}
                  </Text>
                  {renderCategorySettings("anarchy")}
                </Tabs.Panel>

                <Tabs.Panel value="appearance">
                  <Text size="lg" fw={500} className={classes.title}>
                    {t("Settings.Appearance")}
                  </Text>
                  <Text size="xs" c="dimmed" mt={3} mb="lg">
                    {t("Settings.Appearance.Desc")}
                  </Text>
                  {renderCategorySettings("appearance")}
                </Tabs.Panel>

                <Tabs.Panel value="language">
                  <Text size="lg" fw={500} className={classes.title}>
                    {t("Settings.Language")}
                  </Text>
                  <Text size="xs" c="dimmed" mt={3} mb="md">
                    {t("Settings.Language.Desc")}
                  </Text>
                  {/* Multilingual rescue banner — always readable regardless of current language */}
                  <Card
                    withBorder
                    p="sm"
                    mb="lg"
                    radius="md"
                    style={{
                      backgroundColor: "var(--mantine-color-default-hover)",
                      borderColor: "var(--mantine-color-dimmed)",
                    }}
                  >
                    <SimpleGrid cols={3} spacing="xs" verticalSpacing={4}>
                      {LANGUAGE_RESCUE.map((lang) => {
                        const isActive = i18n.language === lang.value;
                        return (
                          <Button
                            key={lang.value}
                            variant={isActive ? "filled" : "subtle"}
                            size="compact-sm"
                            onClick={() => {
                              if (isActive) return;
                              const prevLang = i18n.language;
                              i18n.changeLanguage(lang.value);
                              localStorage.setItem("lang", lang.value);
                              const ttsLangs = [
                                "en",
                                "fr",
                                "es",
                                "de",
                                "hi",
                                "ja",
                                "ru",
                                "zh",
                                "ko",
                              ];
                              const base = lang.value.split("-")[0];
                              if (ttsLangs.includes(base)) {
                                setTtsLanguage(base);
                              }

                              // Show undo toast in previous language
                              const prevName =
                                LANGUAGE_RESCUE.find(
                                  (l) => l.value === prevLang,
                                )?.native || prevLang;
                              const msg =
                                UNDO_MESSAGES[prevLang] ||
                                UNDO_MESSAGES["en-US"];
                              notifications.show({
                                id: "language-undo",
                                title: `${msg.changed} → ${lang.native}`,
                                message: (
                                  <Button
                                    variant="subtle"
                                    size="compact-sm"
                                    onClick={() => {
                                      i18n.changeLanguage(prevLang);
                                      localStorage.setItem("lang", prevLang);
                                      const prevBase = prevLang.split("-")[0];
                                      if (ttsLangs.includes(prevBase)) {
                                        setTtsLanguage(prevBase);
                                      }
                                      notifications.hide("language-undo");
                                    }}
                                  >
                                    {msg.undo} → {prevName}
                                  </Button>
                                ),
                                autoClose: 10000,
                              });
                            }}
                          >
                            {lang.native}
                          </Button>
                        );
                      })}
                    </SimpleGrid>
                  </Card>
                  {/* Multilingual hint: how to find this page again */}
                  <Text size="xs" c="dimmed" mt="xs" fs="italic">
                    {
                      "🌐 Look for the blue globe (🌐) in the sidebar or settings tabs to find this page."
                    }
                  </Text>
                  <Text size="xs" c="dimmed" mt={4} fs="italic">
                    {
                      "🌐 Cherchez le globe bleu (🌐) · Busca el globo azul (🌐) · Suchen Sie die blaue Weltkugel (🌐) · Ищите синий глобус (🌐) · 파란 지구본(🌐)을 찾으세요 · 找到蓝色地球图标(🌐)"
                    }
                  </Text>
                </Tabs.Panel>

                <Tabs.Panel value="sound">
                  <Text size="lg" fw={500} className={classes.title}>
                    {t("Settings.Sound")}
                  </Text>
                  <Text size="xs" c="dimmed" mt={3} mb="lg">
                    {t("Settings.Sound.Desc")}
                  </Text>
                  {renderCategorySettings("sound")}
                </Tabs.Panel>

                <Tabs.Panel value="tts">
                  <Text size="lg" fw={500} className={classes.title}>
                    {t("Settings.TTS")}
                  </Text>
                  <Text size="xs" c="dimmed" mt={3} mb="lg">
                    {t("Settings.TTS.Desc")}
                  </Text>
                  {renderCategorySettings("tts")}
                </Tabs.Panel>

                <Tabs.Panel value="keybinds">
                  <Group>
                    <Text size="lg" fw={500} className={classes.title}>
                      {t("Settings.Keybinds")}
                    </Text>
                    <Tooltip label={t("Common.Reset")}>
                      <ActionIcon onClick={() => setKeyMap(RESET)}>
                        <IconReload size="1rem" />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                  <Text size="xs" c="dimmed" mt={3} mb="lg">
                    {t("Settings.Keybinds.Desc")}
                  </Text>
                  <Table>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>{t("Common.Description")}</Table.Th>
                        <Table.Th>{t("Settings.Key")}</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {Object.entries(keyMap).map(([action, keybind]) => {
                        return (
                          <Table.Tr key={keybind.name}>
                            <Table.Td>{keybind.name}</Table.Td>
                            <Table.Td>
                              <KeybindInput action={action} keybind={keybind} />
                            </Table.Td>
                          </Table.Tr>
                        );
                      })}
                    </Table.Tbody>
                  </Table>
                </Tabs.Panel>

                <Tabs.Panel value="directories">
                  <Text size="lg" fw={500} className={classes.title}>
                    {t("Settings.Directories")}
                  </Text>
                  <Text size="xs" c="dimmed" mt={3} mb="lg">
                    {t("Settings.Directories.Desc")}
                  </Text>
                  {renderCategorySettings("directories")}
                </Tabs.Panel>

                <Tabs.Panel value="repertoire">
                  <Text size="lg" fw={500} className={classes.title}>
                    {t("Settings.Repertoire")}
                  </Text>
                  <Text size="xs" c="dimmed" mt={3} mb="lg">
                    {t("Settings.Repertoire.Desc")}
                  </Text>
                  {renderCategorySettings("repertoire")}
                </Tabs.Panel>

                <Tabs.Panel value="network">
                  <Text size="lg" fw={500} className={classes.title}>
                    {t("Settings.Network")}
                  </Text>
                  <Text size="xs" c="dimmed" mt={3} mb="lg">
                    {t("Settings.Network.Desc")}
                  </Text>
                  {renderCategorySettings("network")}
                </Tabs.Panel>

                <Tabs.Panel value="privacy">
                  {renderCategorySettings("privacy")}
                </Tabs.Panel>
              </Card>
            </ScrollArea>
            <Text size="xs" c="dimmed" ta="right">
              En Parlant~ v{version}
            </Text>
          </Stack>
        </Tabs>
      )}
    </Stack>
  );
}
