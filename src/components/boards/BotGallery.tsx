import {
  ActionIcon,
  Button,
  Group,
  Modal,
  ScrollArea,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
} from "@mantine/core";
import { IconDice, IconPlus, IconTrash } from "@tabler/icons-react";
import { useAtom } from "jotai";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { savedBotProfilesAtom } from "@/state/atoms";
import { BUILT_IN_PROFILES, type BotProfile, generateBotProfile } from "@/utils/botProfiles";
import { BotEditor } from "./BotEditor";
import { BotProfileCard } from "./BotProfileCard";

export function BotGallery({
  opened,
  onClose,
  onSelect,
  selectedId,
}: {
  opened: boolean;
  onClose: () => void;
  onSelect: (profile: BotProfile) => void;
  selectedId?: string;
}) {
  const { t } = useTranslation();
  const [savedProfiles, setSavedProfiles] = useAtom(savedBotProfilesAtom);
  const [editing, setEditing] = useState<BotProfile | "new" | null>(null);

  function handleSelect(profile: BotProfile) {
    onSelect(profile);
    onClose();
  }

  function handleGenerate() {
    const profile = generateBotProfile();
    onSelect(profile);
    onClose();
  }

  function handleSaveCustom(profile: BotProfile) {
    setSavedProfiles((prev) => {
      const idx = prev.findIndex((p) => p.id === profile.id);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = profile;
        return updated;
      }
      return [...prev, profile];
    });
    setEditing(null);
    onSelect(profile);
    onClose();
  }

  function handleDelete(id: string) {
    setSavedProfiles((prev) => prev.filter((p) => p.id !== id));
  }

  if (editing) {
    return (
      <Modal
        opened={opened}
        onClose={() => {
          setEditing(null);
          onClose();
        }}
        title={t("Board.Bot.CustomizeBot")}
        size="md"
      >
        <BotEditor
          initial={editing === "new" ? undefined : editing}
          onSave={handleSaveCustom}
          onCancel={() => setEditing(null)}
        />
      </Modal>
    );
  }

  return (
    <Modal opened={opened} onClose={onClose} title={t("Board.Bot.BotGallery")} size="lg">
      <Stack gap="md">
        <Group>
          <Button leftSection={<IconDice size={16} />} variant="light" onClick={handleGenerate}>
            {t("Board.Bot.GenerateRandom")}
          </Button>
          <Button
            leftSection={<IconPlus size={16} />}
            variant="light"
            onClick={() => setEditing("new")}
          >
            {t("Board.Bot.CreateCustom")}
          </Button>
        </Group>

        <Tabs defaultValue="gallery">
          <Tabs.List>
            <Tabs.Tab value="gallery">{t("Board.Bot.Gallery")}</Tabs.Tab>
            <Tabs.Tab value="custom">
              {t("Board.Bot.MyBots")} ({savedProfiles.length})
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="gallery" pt="sm">
            <ScrollArea.Autosize mah={400}>
              <SimpleGrid cols={2} spacing="sm">
                {BUILT_IN_PROFILES.map((profile) => (
                  <BotProfileCard
                    key={profile.id}
                    profile={profile}
                    selected={selectedId === profile.id}
                    onClick={() => handleSelect(profile)}
                  />
                ))}
              </SimpleGrid>
            </ScrollArea.Autosize>
          </Tabs.Panel>

          <Tabs.Panel value="custom" pt="sm">
            <ScrollArea.Autosize mah={400}>
              {savedProfiles.length === 0 ? (
                <Text c="dimmed" ta="center" py="xl" size="sm">
                  {t("Board.Bot.NoBots")}
                </Text>
              ) : (
                <SimpleGrid cols={2} spacing="sm">
                  {savedProfiles.map((profile) => (
                    <Group key={profile.id} gap={0} wrap="nowrap" style={{ position: "relative" }}>
                      <BotProfileCard
                        profile={profile}
                        selected={selectedId === profile.id}
                        onClick={() => handleSelect(profile)}
                      />
                      <Stack
                        gap={4}
                        style={{
                          position: "absolute",
                          right: 4,
                          top: 4,
                        }}
                      >
                        <ActionIcon
                          size="xs"
                          variant="subtle"
                          color="red"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(profile.id);
                          }}
                        >
                          <IconTrash size={12} />
                        </ActionIcon>
                      </Stack>
                    </Group>
                  ))}
                </SimpleGrid>
              )}
            </ScrollArea.Autosize>
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </Modal>
  );
}
