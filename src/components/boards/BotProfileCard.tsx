import { Badge, Group, Paper, Stack, Text, UnstyledButton } from "@mantine/core";
import type { BotProfile } from "@/utils/botProfiles";

function eloBadgeColor(elo: number): string {
  if (elo < 800) return "red";
  if (elo < 1200) return "orange";
  if (elo < 1600) return "yellow";
  if (elo < 2000) return "teal";
  return "green";
}

export function BotProfileCard({
  profile,
  selected,
  onClick,
  compact,
}: {
  profile: BotProfile;
  selected?: boolean;
  onClick?: () => void;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <Paper
        p="xs"
        withBorder
        style={{
          borderColor: selected ? "var(--mantine-color-blue-6)" : undefined,
          cursor: onClick ? "pointer" : undefined,
        }}
        onClick={onClick}
      >
        <Group gap="sm" wrap="nowrap">
          <Text size="xl">{profile.avatar}</Text>
          <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
            <Group gap="xs">
              <Text fw={600} size="sm">
                {profile.name}
              </Text>
              <Badge size="xs" color={eloBadgeColor(profile.elo)}>
                {profile.elo}
              </Badge>
            </Group>
            <Text size="xs" c="dimmed" lineClamp={1}>
              {profile.title}
            </Text>
          </Stack>
        </Group>
      </Paper>
    );
  }

  return (
    <UnstyledButton onClick={onClick} w="100%">
      <Paper
        p="sm"
        withBorder
        style={{
          borderColor: selected ? "var(--mantine-color-blue-6)" : undefined,
          borderWidth: selected ? 2 : 1,
        }}
      >
        <Stack gap="xs">
          <Group gap="sm" wrap="nowrap">
            <Text size="2rem">{profile.avatar}</Text>
            <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
              <Group gap="xs">
                <Text fw={700} size="sm">
                  {profile.name}
                </Text>
                <Badge size="sm" color={eloBadgeColor(profile.elo)}>
                  {profile.elo}
                </Badge>
              </Group>
              <Text size="xs" fw={500} c="dimmed">
                {profile.title}
              </Text>
            </Stack>
          </Group>
          <Text size="xs" c="dimmed" lineClamp={2}>
            {profile.description}
          </Text>
        </Stack>
      </Paper>
    </UnstyledButton>
  );
}
