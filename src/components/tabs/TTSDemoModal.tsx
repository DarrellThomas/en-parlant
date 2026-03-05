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
  IconBrain,
  IconHeadphones,
  IconKey,
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
          <Text fw={600}>Narrated Annotation DEMO</Text>
        </Group>
      }
      size="xl"
    >
      <Stack gap="md">
        <Text size="md">
          What you are hearing in this demo are <strong>ElevenLabs</strong>{" "}
          voices — 9 languages and growing. Pick one, then{" "}
          <strong>step through the moves yourself</strong> using the arrow keys
          or navigation buttons. Each move announces as you go. Your pace, not
          auto-play.
        </Text>

        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
          <Box
            p="sm"
            style={{
              borderRadius: "var(--mantine-radius-md)",
              border: "1px solid var(--mantine-color-default-border)",
            }}
          >
            <Group gap="xs" mb={4}>
              <IconBrain size={16} />
              <Text size="sm" fw={600}>
                Free option
              </Text>
              <Badge size="xs" color="green" variant="light">
                Open source
              </Badge>
            </Group>
            <Text size="xs" c="dimmed">
              <strong>KittenTTS</strong> is a free, open-source model we support
              — and it punches well above its weight. Install it locally, and
              you can run that server right at home. Our documentation will walk
              you through it.
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
                Bring your own key
              </Text>
              <Badge size="xs" color="violet" variant="light">
                BYOK
              </Badge>
            </Group>
            <Text size="xs" c="dimmed">
              This was the original idea behind TTS narration. Paste in your API
              key, and you've got it — <strong>ElevenLabs</strong> or{" "}
              <strong>Google Cloud</strong>. Lots of options for lots of use
              cases.
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
                  color="blue"
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
