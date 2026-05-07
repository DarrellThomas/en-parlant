import {
  Button,
  Group,
  NumberInput,
  Select,
  SimpleGrid,
  Slider,
  Stack,
  Text,
  TextInput,
  Textarea,
  UnstyledButton,
} from "@mantine/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { BotProfile, BotStyle } from "@/utils/botProfiles";

const EMOJI_OPTIONS = [
  "\u{1F60A}",
  "\u{1F913}",
  "\u{1F60E}",
  "\u{1F914}",
  "\u{1F9D0}",
  "\u{1F47E}",
  "\u{1F916}",
  "\u{1F3AF}",
  "\u{1F9E9}",
  "\u{1F3B2}",
  "\u265F\uFE0F",
  "\u{1F40E}",
  "\u{1F9CA}",
  "\u{1F30D}",
  "\u{1F308}",
  "\u{1F680}",
  "\u{1F3C6}",
  "\u{1F48E}",
  "\u{1F52D}",
  "\u{1F3B5}",
  "\u{1F525}",
  "\u26A1",
  "\u2B50",
  "\u{1F451}",
  "\u{1F393}",
  "\u{1F6E1}\uFE0F",
  "\u2694\uFE0F",
  "\u26F0\uFE0F",
  "\u{1F338}",
  "\u{1F52E}",
];

export function BotEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial?: BotProfile;
  onSave: (profile: BotProfile) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial?.name ?? "");
  const [title, setTitle] = useState(initial?.title ?? "Custom Bot");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [elo, setElo] = useState(initial?.elo ?? 1200);
  const [avatar, setAvatar] = useState(initial?.avatar ?? "\u265F\uFE0F");
  const [aggression, setAggression] = useState(initial?.style.aggression ?? 50);
  const [moveSpeed, setMoveSpeed] = useState<BotStyle["moveSpeed"]>(
    initial?.style.moveSpeed ?? "normal",
  );

  function handleSave() {
    const profile: BotProfile = {
      id: initial?.id ?? crypto.randomUUID(),
      name: name || "Bot",
      title,
      description,
      elo,
      avatar,
      style: { aggression, moveSpeed },
      builtIn: false,
    };
    onSave(profile);
  }

  return (
    <Stack gap="md">
      <Group gap="sm" align="flex-end">
        <TextInput
          label={t("Board.Bot.Name")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ flex: 1 }}
        />
        <NumberInput
          label={t("Board.Bot.Elo")}
          value={elo}
          onChange={(v) => setElo(typeof v === "number" ? v : 1200)}
          min={400}
          max={3000}
          step={50}
          w={100}
        />
      </Group>

      <TextInput
        label={t("Board.Bot.Title")}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      <Stack gap={4}>
        <Text size="sm" fw={500}>
          {t("Board.Bot.Avatar")}
        </Text>
        <SimpleGrid cols={10} spacing={4}>
          {EMOJI_OPTIONS.map((emoji) => (
            <UnstyledButton
              key={emoji}
              onClick={() => setAvatar(emoji)}
              style={{
                textAlign: "center",
                fontSize: "1.4rem",
                padding: 4,
                borderRadius: 4,
                border:
                  avatar === emoji
                    ? "2px solid var(--mantine-color-blue-6)"
                    : "2px solid transparent",
              }}
            >
              {emoji}
            </UnstyledButton>
          ))}
        </SimpleGrid>
      </Stack>

      <Stack gap={4}>
        <Text size="sm" fw={500}>
          {t("Board.Bot.Aggression")}
        </Text>
        <Slider
          value={aggression}
          onChange={setAggression}
          min={0}
          max={100}
          marks={[
            { value: 0, label: t("Board.Bot.Passive") },
            { value: 50, label: t("Board.Bot.Balanced") },
            { value: 100, label: t("Board.Bot.Aggressive") },
          ]}
          mb="lg"
        />
      </Stack>

      <Select
        label={t("Board.Bot.MoveSpeed")}
        data={[
          { value: "fast", label: t("Board.Bot.SpeedFast") },
          { value: "normal", label: t("Board.Bot.SpeedNormal") },
          { value: "slow", label: t("Board.Bot.SpeedSlow") },
          { value: "deliberate", label: t("Board.Bot.SpeedDeliberate") },
        ]}
        value={moveSpeed}
        onChange={(v) => setMoveSpeed((v as BotStyle["moveSpeed"]) ?? "normal")}
        allowDeselect={false}
      />

      <Textarea
        label={t("Board.Bot.Description")}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        minRows={2}
        maxRows={4}
        autosize
      />

      <Group justify="flex-end">
        <Button variant="default" onClick={onCancel}>
          {t("Common.Cancel")}
        </Button>
        <Button onClick={handleSave}>{t("Common.Save")}</Button>
      </Group>
    </Stack>
  );
}
