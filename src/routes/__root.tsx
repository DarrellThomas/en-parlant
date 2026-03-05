import { AppShell } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  createRootRouteWithContext,
  Outlet,
  useNavigate,
} from "@tanstack/react-router";
import { TauriEvent } from "@tauri-apps/api/event";
import {
  Menu,
  MenuItem,
  PredefinedMenuItem,
  Submenu,
} from "@tauri-apps/api/menu";
import { appLogDir, resolve } from "@tauri-apps/api/path";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ask, open } from "@tauri-apps/plugin-dialog";
import { platform } from "@tauri-apps/plugin-os";
import { exit } from "@tauri-apps/plugin-process";
import { open as shellOpen } from "@tauri-apps/plugin-shell";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { useAtom, useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useTranslation } from "react-i18next";
import useSWRImmutable from "swr/immutable";
import { match } from "ts-pattern";
import type { Dirs } from "@/App";
import AboutModal from "@/components/About";
import { SideBar } from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import UpdateModal from "@/components/UpdateModal";
import {
  activeTabAtom,
  docLangAtom,
  nativeBarAtom,
  tabsAtom,
} from "@/state/atoms";
import { keyMapAtom } from "@/state/keybinds";
import { openFile } from "@/utils/files";
import { createTab } from "@/utils/tabs";

type MenuGroup = {
  label: string;
  options: MenuAction[];
};

type MenuAction = {
  id?: string;
  label: string;
  shortcut?: string;
  action?: () => void;
  item?:
    | "Hide"
    | "Copy"
    | "Cut"
    | "Paste"
    | "SelectAll"
    | "Undo"
    | "Redo"
    | "Quit";
  submenu?: MenuAction[];
};

async function createMenu(menuActions: MenuGroup[]) {
  const items = await Promise.all(
    menuActions.map(async (group) => {
      const submenuItems = await Promise.all(
        group.options.map(async (option) => {
          return match(option.label)
            .with("divider", () =>
              PredefinedMenuItem.new({
                item: "Separator",
              }),
            )
            .otherwise(async () => {
              if (option.item) {
                return PredefinedMenuItem.new({
                  text: option.label,
                  item: option.item,
                });
              }

              if (option.submenu) {
                const children = await Promise.all(
                  option.submenu.map((sub) =>
                    MenuItem.new({
                      id: sub.id,
                      text: sub.label,
                      action: sub.action,
                    }),
                  ),
                );
                return Submenu.new({
                  text: option.label,
                  items: children,
                });
              }

              return MenuItem.new({
                id: option.id,
                text: option.label,
                accelerator: option.shortcut,
                action: option.action,
              });
            });
        }),
      );

      return Submenu.new({
        text: group.label,
        items: submenuItems,
      });
    }),
  );

  return Menu.new({
    items: items,
  });
}

export const Route = createRootRouteWithContext<{
  loadDirs: () => Promise<Dirs>;
}>()({
  component: RootLayout,
});

function RootLayout() {
  const isNative = useAtomValue(nativeBarAtom);
  const navigate = useNavigate();

  const [, setTabs] = useAtom(tabsAtom);
  const [, setActiveTab] = useAtom(activeTabAtom);
  const docLang = useAtomValue(docLangAtom);

  const { t } = useTranslation();

  const openNewFile = useCallback(async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: "PGN file", extensions: ["pgn"] }],
    });
    if (typeof selected === "string") {
      navigate({ to: "/" });
      openFile(selected, setTabs, setActiveTab);
    }
  }, [navigate, setActiveTab, setTabs]);

  const createNewTab = useCallback(() => {
    navigate({ to: "/" });
    createTab({
      tab: { name: t("Tab.NewTab"), type: "new" },
      setTabs,
      setActiveTab,
    });
  }, [navigate, setActiveTab, setTabs, t]);

  const [updateModalOpened, setUpdateModalOpened] = useState(false);
  const [pendingUpdate, setPendingUpdate] = useState<Update | null>(null);

  const checkForUpdates = useCallback(async () => {
    const update = await check();
    if (update) {
      setPendingUpdate(update);
      setUpdateModalOpened(true);
    } else {
      notifications.show({
        title: "Updates",
        message: "No updates available.",
      });
    }
  }, []);

  // Auto-check for updates on startup (silently — no toast if already up to date)
  useEffect(() => {
    check()
      .then((update) => {
        if (update) {
          setPendingUpdate(update);
          setUpdateModalOpened(true);
        }
      })
      .catch(() => {
        // Ignore network/update-check errors at startup
      });
  }, []);

  const openSettings = useCallback(async () => {
    navigate({ to: "/settings" });
  }, [navigate]);

  const [keyMap] = useAtom(keyMapAtom);

  useHotkeys(keyMap.NEW_TAB.keys, createNewTab);
  useHotkeys(keyMap.OPEN_FILE.keys, openNewFile);
  const [opened, setOpened] = useState(false);

  const DOCS_BASE = "https://enparlant.redshed.ai";
  function docsUrl(path: string, lang: string): string {
    return lang === "en"
      ? `${DOCS_BASE}/docs/${path}/`
      : `${DOCS_BASE}/${lang}/docs/${path}/`;
  }

  const isMacOS = platform() === "macos";

  const aboutOption = {
    label: t("Menu.Help.About"),
    id: "about",
    action: () => setOpened(true),
  };

  const checkForUpdatesOption = {
    label: t("Menu.Help.CheckUpdate"),
    id: "check_for_updates",
    action: checkForUpdates,
  };

  const appMenu: MenuGroup = {
    label: "Application Menu",
    options: [
      {
        label: t("Menu.Application.About", {
          defaultValue: t("Menu.Help.About"),
        }),
        id: aboutOption.id,
        action: aboutOption.action,
      },
      checkForUpdatesOption,
      { label: "divider" },
      {
        label: t("SideBar.Settings") + "...",
        id: "settings",
        shortcut: "cmd+,",
        action: openSettings,
      },
      {
        label: t("Menu.Application.Hide"),
        item: "Hide",
      },
      { label: "divider" },
      {
        label: t("Menu.Application.Quit", {
          defaultValue: t("Menu.File.Exit"),
        }),
        item: "Quit",
      },
    ],
  };

  const macOSEditMenu: MenuGroup = {
    label: t("Menu.Edit"),
    options: [
      {
        label: t("Menu.Edit.Undo"),
        item: "Undo",
      },
      {
        label: t("Menu.Edit.Redo"),
        item: "Redo",
      },
      { label: "divider" },
      {
        label: t("Menu.Edit.Copy"),
        item: "Copy",
      },
      {
        label: t("Menu.Edit.Cut"),
        item: "Cut",
      },
      {
        label: t("Menu.Edit.Paste"),
        item: "Paste",
      },
      { label: "divider" },
      {
        label: t("Menu.Edit.SelectAll"),
        item: "SelectAll",
      },
    ],
  };

  const menuActions: MenuGroup[] = useMemo(
    () => [
      ...(isMacOS ? [appMenu] : []),
      {
        label: t("Menu.File"),
        options: [
          {
            label: t("Menu.File.NewTab"),
            id: "new_tab",
            shortcut: keyMap.NEW_TAB.keys,
            action: createNewTab,
          },
          {
            label: t("Menu.File.OpenFile"),
            id: "open_file",
            shortcut: keyMap.OPEN_FILE.keys,
            action: openNewFile,
          },
          ...(!isMacOS
            ? [
                {
                  label: t("Menu.File.Exit"),
                  id: "exit",
                  action: () => exit(0),
                },
              ]
            : []),
        ],
      },
      ...(!isMacOS ? [] : [macOSEditMenu]),
      {
        label: t("Menu.View"),
        options: [
          {
            label: t("Menu.View.Reload"),
            id: "reload",
            shortcut: "Ctrl+R",
            action: () => location.reload(),
          },
        ],
      },
      {
        label: t("Menu.Help"),
        options: [
          {
            label: t("Menu.Help.Docs"),
            id: "documentation",
            action: () => shellOpen(`${DOCS_BASE}/docs/`),
          },
          {
            label: t("Menu.Help.License"),
            id: "license",
            action: () =>
              shellOpen(
                "https://github.com/DarrellThomas/en-parlant/blob/master/LICENSE",
              ),
          },
          {
            label: t("Menu.Help.Credits"),
            id: "credits",
            action: () => shellOpen(`${DOCS_BASE}/credits/`),
          },
          {
            label: t("Menu.Help.Architecture"),
            id: "architecture",
            action: () => shellOpen(docsUrl("architecture", docLang)),
          },
          { label: "divider" },
          {
            label: t("Menu.Help.ClearSavedData"),
            id: "clear_saved_data",
            action: () => {
              ask("Are you sure you want to clear all saved data?", {
                title: "Clear data",
              }).then((res) => {
                if (res) {
                  localStorage.clear();
                  sessionStorage.clear();
                  location.reload();
                }
              });
            },
          },
          {
            label: t("Menu.Help.OpenLogs"),
            id: "logs",
            action: async () => {
              const path = await resolve(await appLogDir(), "en-parlant.log");
              notifications.show({
                title: "Logs",
                message: `Opened logs in ${path}`,
              });
              await shellOpen(path);
            },
          },
          { label: "divider" },
          {
            label: t("Menu.Help.ReportIssue"),
            id: "report_issue",
            action: () =>
              shellOpen(
                "https://github.com/DarrellThomas/en-parlant/issues/new",
              ),
          },
          { label: "divider" },
          ...(!isMacOS ? [checkForUpdatesOption, aboutOption] : []),
        ],
      },
    ],
    [t, checkForUpdates, createNewTab, keyMap, openNewFile, docLang],
  );

  const { data: menu } = useSWRImmutable(["menu", menuActions], () =>
    createMenu(menuActions),
  );

  useEffect(() => {
    if (!menu) return;
    if (isNative || import.meta.env.VITE_PLATFORM !== "win32") {
      menu.setAsAppMenu();
      getCurrentWindow().setDecorations(true);
    } else {
      Menu.new().then((m) => m.setAsAppMenu());
      getCurrentWindow().setDecorations(false);
    }
  }, [menu, isNative]);

  useEffect(() => {
    const unlisten = getCurrentWindow().listen(
      TauriEvent.DRAG_DROP,
      (event) => {
        const payload = event.payload as { paths: string[] };
        if (payload?.paths) {
          const pgnFiles = payload.paths.filter((path) =>
            path.toLowerCase().endsWith(".pgn"),
          );

          if (pgnFiles.length > 0) {
            navigate({ to: "/" });
            for (const file of pgnFiles) {
              openFile(file, setTabs, setActiveTab);
            }
          }
        }
      },
    );

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [navigate, setTabs, setActiveTab]);

  return (
    <AppShell
      navbar={{
        width: "3rem",
        breakpoint: 0,
      }}
      header={
        isNative || import.meta.env.VITE_PLATFORM !== "win32"
          ? undefined
          : {
              height: "2.25rem",
            }
      }
      styles={{
        main: {
          height: "100vh",
          userSelect: "none",
        },
      }}
    >
      <AboutModal opened={opened} setOpened={setOpened} />
      <UpdateModal
        opened={updateModalOpened}
        onClose={() => setUpdateModalOpened(false)}
        update={pendingUpdate}
      />
      {!isNative && import.meta.env.VITE_PLATFORM === "win32" && (
        <AppShell.Header>
          <TopBar menuActions={menuActions} />
        </AppShell.Header>
      )}
      <AppShell.Navbar>
        <SideBar />
      </AppShell.Navbar>
      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
