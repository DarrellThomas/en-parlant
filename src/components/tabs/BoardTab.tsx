import { ActionIcon, Button, Group, Image, Menu } from "@mantine/core";
import { useClickOutside, useHotkeys, useToggle } from "@mantine/hooks";
import { IconCopy, IconEdit, IconX } from "@tabler/icons-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import cx from "clsx";
import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { enginesAtom, tabEngineSettingsFamily } from "@/state/atoms";
import type { Engine } from "@/utils/engines";
import type { Tab } from "@/utils/tabs";
import { InlineInput } from "../common/InlineInput";
import classes from "./BoardTab.module.css";

function resolveEngineIconSrc(image: string | null | undefined): string | undefined {
  if (!image) return undefined;
  // Local filesystem paths need the Tauri asset protocol; web URLs pass through.
  if (image.startsWith("http://") || image.startsWith("https://")) return image;
  return convertFileSrc(image);
}

function EngineIcon({ engine, tabValue }: { engine: Engine; tabValue: string }) {
  const settings = useAtomValue(
    tabEngineSettingsFamily({
      tab: tabValue,
      engineId: engine.id,
      defaultSettings: engine.type === "local" ? engine.settings || [] : undefined,
      defaultGo: engine.go ?? undefined,
    }),
  );
  if (!settings.enabled) return null;
  const src = resolveEngineIconSrc(engine.image);
  if (!src) return null;
  return (
    <Image
      src={src}
      alt={engine.name}
      title={engine.name}
      h={14}
      w={14}
      fit="contain"
      style={{ flexShrink: 0 }}
    />
  );
}

function EngineIconRow({ tabValue }: { tabValue: string }) {
  const engines = useAtomValue(enginesAtom);
  const loaded = (engines ?? []).filter((e) => e.loaded);
  if (loaded.length === 0) return null;
  return (
    <Group gap={4} wrap="nowrap">
      {loaded.map((e) => (
        <EngineIcon key={e.id} engine={e} tabValue={tabValue} />
      ))}
    </Group>
  );
}

export function BoardTab({
  tab,
  setActiveTab,
  closeTab,
  renameTab,
  duplicateTab,
  selected,
}: {
  tab: Tab;
  setActiveTab: (v: string) => void;
  closeTab: (v: string) => void;
  renameTab: (v: string, n: string) => void;
  duplicateTab: (v: string) => void;
  selected: boolean;
}) {
  const [open, toggleOpen] = useToggle();
  const [renaming, toggleRenaming] = useToggle();

  const ref = useClickOutside(() => {
    toggleOpen(false);
    toggleRenaming(false);
  });

  useHotkeys([
    [
      "F2",
      () => {
        if (selected) toggleRenaming();
      },
    ],
  ]);

  useEffect(() => {
    if (renaming) ref.current?.focus();
  }, [renaming, ref]);

  return (
    <Menu opened={open} shadow="md" width={200} closeOnClickOutside>
      <Menu.Target>
        <Button
          component="div"
          className={cx(classes.tab, { [classes.selected]: selected })}
          variant="default"
          fw="normal"
          radius={0}
          rightSection={
            <ActionIcon
              component="div"
              className={classes.closeTabBtn}
              onClick={(e) => {
                closeTab(tab.value);
                e.stopPropagation();
              }}
              size="0.875rem"
            >
              <IconX />
            </ActionIcon>
          }
          onPointerDown={(e) => {
            if (e.button === 0) setActiveTab(tab.value);
          }}
          onDoubleClick={() => toggleRenaming(true)}
          onAuxClick={(e) => {
            if (e.button === 1) closeTab(tab.value);
          }}
          onContextMenu={(e) => {
            toggleOpen();
            e.preventDefault();
          }}
        >
          <Group gap="xs" wrap="nowrap" align="center">
            <InlineInput
              ref={ref}
              disabled={!renaming}
              value={tab.name}
              className={classes.input}
              onChange={(e) => renameTab(tab.value, e.target.value)}
              onFocus={(e) => e.target.select()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  toggleRenaming(false);
                  e.preventDefault();
                }
              }}
            />
            {tab.type === "analysis" && <EngineIconRow tabValue={tab.value} />}
          </Group>
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          leftSection={<IconCopy size="0.875rem" />}
          onClick={() => duplicateTab(tab.value)}
        >
          Duplicate Tab
        </Menu.Item>
        <Menu.Item leftSection={<IconEdit size="0.875rem" />} onClick={() => toggleRenaming(true)}>
          Rename Tab
        </Menu.Item>
        <Menu.Item
          color="red"
          leftSection={<IconX size="0.875rem" />}
          onClick={() => closeTab(tab.value)}
        >
          Close Tab
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
