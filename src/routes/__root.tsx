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
import { appLogDir, resolve, resolveResource } from "@tauri-apps/api/path";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ask, open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
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
import UpdateModal from "@/components/UpdateModal";
import { SideBar } from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import {
  activeTabAtom,
  docLangAtom,
  nativeBarAtom,
  tabsAtom,
  ttsLanguageAtom,
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
  const [docLang, setDocLang] = useAtom(docLangAtom);
  const [, setTtsLang] = useAtom(ttsLanguageAtom);

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

  const openDemo = useCallback(
    async (lang: string, label: string, gender: "male" | "female" = "male") => {
      try {
        const p = await resolveResource(`docs/demos/tts-demo-${lang}.pgn`);
        let pgn = await readTextFile(p);
        // Inject gender header so the TTS system knows which clips to fetch
        pgn = pgn.replace(
          '[AudioSource "demo"]',
          `[AudioSource "demo"]\n[AudioGender "${gender}"]`,
        );
        navigate({ to: "/" });
        createTab({
          tab: { name: `TTS Demo (${label})`, type: "analysis" },
          setTabs,
          setActiveTab,
          pgn,
        });
      } catch (e) {
        console.error("Failed to open demo:", e);
      }
    },
    [navigate, setTabs, setActiveTab],
  );

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
        label: "TTS",
        options: [
          {
            label: "Getting Started",
            id: "tts_getting_started",
            action: () => shellOpen(docsUrl("tts-guide", docLang)),
          },
          {
            label: "TTS Demo (Male)",
            id: "tts_demo_male",
            submenu: [
              { label: "English", id: "tts_demo_m_en", action: () => openDemo("en", "English", "male") },
              { label: "Fran\u00e7ais", id: "tts_demo_m_fr", action: () => openDemo("fr", "Fran\u00e7ais", "male") },
              { label: "Espa\u00f1ol", id: "tts_demo_m_es", action: () => openDemo("es", "Espa\u00f1ol", "male") },
              { label: "Deutsch", id: "tts_demo_m_de", action: () => openDemo("de", "Deutsch", "male") },
              { label: "\u65e5\u672c\u8a9e", id: "tts_demo_m_ja", action: () => openDemo("ja", "\u65e5\u672c\u8a9e", "male") },
              { label: "\u0420\u0443\u0441\u0441\u043a\u0438\u0439", id: "tts_demo_m_ru", action: () => openDemo("ru", "\u0420\u0443\u0441\u0441\u043a\u0438\u0439", "male") },
              { label: "\u4e2d\u6587", id: "tts_demo_m_zh", action: () => openDemo("zh", "\u4e2d\u6587", "male") },
              { label: "\uD55C\uAD6D\uC5B4", id: "tts_demo_m_ko", action: () => openDemo("ko", "\uD55C\uAD6D\uC5B4", "male") },
              { label: "\u0939\u093F\u0928\u094D\u0926\u0940", id: "tts_demo_m_hi", action: () => openDemo("hi", "\u0939\u093F\u0928\u094D\u0926\u0940", "male") },
            ],
          },
          {
            label: "TTS Demo (Female)",
            id: "tts_demo_female",
            submenu: [
              { label: "English", id: "tts_demo_f_en", action: () => openDemo("en", "English", "female") },
              { label: "Fran\u00e7ais", id: "tts_demo_f_fr", action: () => openDemo("fr", "Fran\u00e7ais", "female") },
              { label: "Espa\u00f1ol", id: "tts_demo_f_es", action: () => openDemo("es", "Espa\u00f1ol", "female") },
              { label: "Deutsch", id: "tts_demo_f_de", action: () => openDemo("de", "Deutsch", "female") },
              { label: "\u65e5\u672c\u8a9e", id: "tts_demo_f_ja", action: () => openDemo("ja", "\u65e5\u672c\u8a9e", "female") },
              { label: "\u0420\u0443\u0441\u0441\u043a\u0438\u0439", id: "tts_demo_f_ru", action: () => openDemo("ru", "\u0420\u0443\u0441\u0441\u043a\u0438\u0439", "female") },
              { label: "\u4e2d\u6587", id: "tts_demo_f_zh", action: () => openDemo("zh", "\u4e2d\u6587", "female") },
              { label: "\uD55C\uAD6D\uC5B4", id: "tts_demo_f_ko", action: () => openDemo("ko", "\uD55C\uAD6D\uC5B4", "female") },
              { label: "\u0939\u093F\u0928\u094D\u0926\u0940", id: "tts_demo_f_hi", action: () => openDemo("hi", "\u0939\u093F\u0928\u094D\u0926\u0940", "female") },
            ],
          },
          {
            label: "TTS Settings",
            id: "tts_settings",
            action: () => {
              navigate({ to: "/settings", search: { tab: "sound" } });
            },
          },
        ],
      },
      {
        label: t("Menu.Help"),
        options: [
          {
            label: "En Parlant~ Docs",
            id: "documentation",
            action: () => shellOpen(`${DOCS_BASE}/docs/`),
          },
          {
            label: "License (GPL-3.0)",
            id: "license",
            action: () =>
              shellOpen(
                "https://github.com/DarrellThomas/en-parlant/blob/master/LICENSE",
              ),
          },
          {
            label: "Under the Hood",
            id: "architecture",
            action: () => shellOpen(docsUrl("architecture", docLang)),
          },
          { label: "divider" },
          {
            label: "About AI",
            id: "about_ai",
            submenu: [
              {
                label: "A Note from Darrell",
                id: "ai_note",
                action: () => shellOpen(docsUrl("ai-note", docLang)),
              },
              {
                label: "A Note from Claude",
                id: "claude_note",
                action: () => shellOpen(docsUrl("claude-note", docLang)),
              },
              {
                label: "AI Workflow",
                id: "ai_workflow",
                action: () => shellOpen(docsUrl("ai-workflow", docLang)),
              },
            ],
          },
          { label: "divider" },
          {
            label: "Language / Langue",
            id: "language_selector",
            submenu: [
              {
                label: `${docLang === "en" ? "\u2713 " : ""}English`,
                id: "lang_en",
                action: () => {
                  if (docLang === "en") return;
                  ask("Switch to English?", {
                    title: "Language / Langue",
                  }).then((yes) => {
                    if (yes) {
                      setDocLang("en");
                      setTtsLang("en");
                    }
                  });
                },
              },
              {
                label: `${docLang === "fr" ? "\u2713 " : ""}Fran\u00e7ais`,
                id: "lang_fr",
                action: () => {
                  if (docLang === "fr") return;
                  ask("Switch to Fran\u00e7ais (French)?", {
                    title: "Language / Langue",
                  }).then((yes) => {
                    if (yes) {
                      setDocLang("fr");
                      setTtsLang("fr");
                    }
                  });
                },
              },
              {
                label: `${docLang === "es" ? "\u2713 " : ""}Espa\u00f1ol`,
                id: "lang_es",
                action: () => {
                  if (docLang === "es") return;
                  ask("Switch to Espa\u00f1ol (Spanish)?", {
                    title: "Language / Langue",
                  }).then((yes) => {
                    if (yes) {
                      setDocLang("es");
                      setTtsLang("es");
                    }
                  });
                },
              },
              {
                label: `${docLang === "de" ? "\u2713 " : ""}Deutsch`,
                id: "lang_de",
                action: () => {
                  if (docLang === "de") return;
                  ask("Switch to Deutsch (German)?", {
                    title: "Language / Langue",
                  }).then((yes) => {
                    if (yes) {
                      setDocLang("de");
                      setTtsLang("de");
                    }
                  });
                },
              },
              {
                label: `${docLang === "ja" ? "\u2713 " : ""}\u65e5\u672c\u8a9e`,
                id: "lang_ja",
                action: () => {
                  if (docLang === "ja") return;
                  ask("Switch to \u65e5\u672c\u8a9e (Japanese)?", {
                    title: "Language / Langue",
                  }).then((yes) => {
                    if (yes) {
                      setDocLang("ja");
                      setTtsLang("ja");
                    }
                  });
                },
              },
              {
                label: `${docLang === "ru" ? "\u2713 " : ""}\u0420\u0443\u0441\u0441\u043a\u0438\u0439`,
                id: "lang_ru",
                action: () => {
                  if (docLang === "ru") return;
                  ask(
                    "Switch to \u0420\u0443\u0441\u0441\u043a\u0438\u0439 (Russian)?",
                    {
                      title: "Language / Langue",
                    },
                  ).then((yes) => {
                    if (yes) {
                      setDocLang("ru");
                      setTtsLang("ru");
                    }
                  });
                },
              },
              {
                label: `${docLang === "zh" ? "\u2713 " : ""}\u4e2d\u6587`,
                id: "lang_zh",
                action: () => {
                  if (docLang === "zh") return;
                  ask("Switch to \u4e2d\u6587 (Chinese)?", {
                    title: "Language / Langue",
                  }).then((yes) => {
                    if (yes) {
                      setDocLang("zh");
                      setTtsLang("zh");
                    }
                  });
                },
              },
              {
                label: `${docLang === "ko" ? "\u2713 " : ""}\uD55C\uAD6D\uC5B4`,
                id: "lang_ko",
                action: () => {
                  if (docLang === "ko") return;
                  ask("Switch to \uD55C\uAD6D\uC5B4 (Korean)?", {
                    title: "Language / Langue",
                  }).then((yes) => {
                    if (yes) {
                      setDocLang("ko");
                      setTtsLang("ko");
                    }
                  });
                },
              },
            ],
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
          ...(!isMacOS ? [checkForUpdatesOption, aboutOption] : []),
        ],
      },
    ],
    [
      t,
      checkForUpdates,
      createNewTab,
      keyMap,
      openNewFile,
      openDemo,
      docLang,
      setDocLang,
      setTtsLang,
    ],
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
