import {
  Anchor,
  Badge,
  Box,
  Button,
  Divider,
  Group,
  Modal,
  SimpleGrid,
  Stack,
  Text,
} from "@mantine/core";
import {
  IconHeadphones,
  IconKey,
  IconPlayerPlay,
  IconSparkles,
} from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useAtom, useSetAtom } from "jotai";
import { activeTabAtom, tabsAtom } from "@/state/atoms";
import { createTab } from "@/utils/tabs";

const DEMO_LANGUAGES = [
  { code: "en", label: "English", flag: "🇬🇧", male: "Male", female: "Female" },
  {
    code: "fr",
    label: "Français",
    flag: "🇫🇷",
    male: "Masculin",
    female: "Féminin",
  },
  {
    code: "es",
    label: "Español",
    flag: "🇪🇸",
    male: "Masculino",
    female: "Femenino",
  },
  {
    code: "de",
    label: "Deutsch",
    flag: "🇩🇪",
    male: "Männlich",
    female: "Weiblich",
  },
  { code: "ja", label: "日本語", flag: "🇯🇵", male: "男性", female: "女性" },
  {
    code: "ru",
    label: "Русский",
    flag: "🇷🇺",
    male: "Мужской",
    female: "Женский",
  },
  { code: "zh", label: "中文", flag: "🇨🇳", male: "男声", female: "女声" },
  { code: "ko", label: "한국어", flag: "🇰🇷", male: "남성", female: "여성" },
  { code: "hi", label: "हिन्दी", flag: "🇮🇳", male: "पुरुष", female: "महिला" },
];

export default function TTSDemoModal({
  opened,
  onClose,
}: {
  opened: boolean;
  onClose: () => void;
}) {
  const [, setTabs] = useAtom(tabsAtom);
  const setActiveTab = useSetAtom(activeTabAtom);
  const navigate = useNavigate();

  async function openDemo(
    lang: string,
    label: string,
    gender: "male" | "female",
  ) {
    try {
      const res = await fetch(
        `https://enparlant.redshed.ai/pgn/demo/tts-demo-${lang}.pgn`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      let pgn = await res.text();
      pgn = pgn.replace(
        '[AudioSource "demo"]',
        `[AudioSource "demo"]\n[AudioGender "${gender}"]`,
      );
      navigate({ to: "/" });
      createTab({
        tab: { name: `Demo — ${label}`, type: "analysis" },
        setTabs,
        setActiveTab,
        pgn,
      });
      onClose();
    } catch (e) {
      console.error("Failed to open demo:", e);
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="xs">
          <IconHeadphones size={20} />
          <Text fw={600}>Narrated Debrief — Demo</Text>
        </Group>
      }
      size="xl"
    >
      <Stack gap="md">
        <Text size="sm">
          This is a short demo of <strong>En Parlant~</strong>'s narrated
          debrief feature. Pick a language, then{" "}
          <strong>step through the moves yourself</strong> using the arrow keys
          or the move list — each move narrates as you go. It's your pace, not
          auto-play.
        </Text>
        <Text size="sm">
          You can load <strong>any annotated PGN</strong> and have it narrated
          in your language. Two service levels are available:
        </Text>

        <SimpleGrid cols={2} spacing="xs">
          <Box
            p="sm"
            style={{
              borderRadius: "var(--mantine-radius-md)",
              border: "1px solid var(--mantine-color-default-border)",
            }}
          >
            <Group gap="xs" mb={4}>
              <IconPlayerPlay size={16} />
              <Text size="sm" fw={600}>
                Free
              </Text>
              <Badge size="xs" color="teal" variant="light">
                No key needed
              </Badge>
            </Group>
            <Text size="xs" c="dimmed">
              Demo audio clips hosted on our servers — English only for now.
              KittyTTS sounds pretty good. OpenTTS and System TTS are included
              so you can hear the contrast — they're not great.
            </Text>
          </Box>

          <Box
            p="sm"
            style={{
              borderRadius: "var(--mantine-radius-md)",
              border: "1px solid var(--mantine-color-default-border)",
            }}
          >
            <Group gap="xs" mb={4}>
              <IconKey size={16} />
              <Text size="sm" fw={600}>
                BYOK
              </Text>
              <Badge size="xs" color="violet" variant="light">
                Bring Your Own Key
              </Badge>
            </Group>
            <Text size="xs" c="dimmed">
              This is the way to go — and it's not expensive for this use case.
              ElevenLabs is the best; Google Cloud is a close second with a more
              generous free tier (1M characters/month). The demos you're hearing
              right now were made with ElevenLabs.
            </Text>
          </Box>
        </SimpleGrid>

        <Divider label="Pick a language and voice" labelPosition="center" />

        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="xs">
          {DEMO_LANGUAGES.map((lang) => (
            <Box
              key={lang.code}
              p="sm"
              style={{
                borderRadius: "var(--mantine-radius-md)",
                border: "1px solid var(--mantine-color-default-border)",
              }}
            >
              <Group gap="xs" mb="xs">
                <Text size="lg">{lang.flag}</Text>
                <Text size="sm" fw={500}>
                  {lang.label}
                </Text>
              </Group>
              <Group gap="xs" grow>
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<IconSparkles size={12} />}
                  onClick={() => openDemo(lang.code, lang.label, "male")}
                >
                  {lang.male}
                </Button>
                <Button
                  size="xs"
                  variant="light"
                  color="pink"
                  leftSection={<IconSparkles size={12} />}
                  onClick={() => openDemo(lang.code, lang.label, "female")}
                >
                  {lang.female}
                </Button>
              </Group>
            </Box>
          ))}
        </SimpleGrid>

        <Text size="xs" c="dimmed" ta="center">
          To set up your own API key, go to{" "}
          <Anchor
            size="xs"
            onClick={() => {
              navigate({ to: "/settings", search: { tab: "sound" } });
              onClose();
            }}
          >
            Settings
          </Anchor>
          {" → "}
          <Anchor
            size="xs"
            onClick={() => {
              navigate({ to: "/settings", search: { tab: "sound" } });
              onClose();
            }}
          >
            Sound
          </Anchor>
          {" → "}
          <Anchor
            size="xs"
            onClick={() => {
              navigate({ to: "/settings", search: { tab: "sound" } });
              onClose();
            }}
          >
            Text to Speech
          </Anchor>
          .
        </Text>
      </Stack>
    </Modal>
  );
}
