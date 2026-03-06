import { Button, Group, Modal, Progress, Stack, Text } from "@mantine/core";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { platform } from "@tauri-apps/plugin-os";
import { relaunch } from "@tauri-apps/plugin-process";
import type { Update } from "@tauri-apps/plugin-updater";
import { useCallback, useRef, useState } from "react";

type UpdateState = "prompt" | "downloading" | "installing" | "error";

function formatMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

function UpdateModal({
  opened,
  onClose,
  update,
}: {
  opened: boolean;
  onClose: () => void;
  update: Update | null;
}) {
  const [state, setState] = useState<UpdateState>("prompt");
  const [progress, setProgress] = useState(0);
  const [downloaded, setDownloaded] = useState(0);
  const [totalSize, setTotalSize] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const downloadedRef = useRef(0);
  const totalSizeRef = useRef<number | null>(null);

  const reset = useCallback(() => {
    setState("prompt");
    setProgress(0);
    setDownloaded(0);
    setTotalSize(null);
    setErrorMessage("");
    downloadedRef.current = 0;
    totalSizeRef.current = null;
  }, []);

  const handleClose = useCallback(() => {
    if (state === "downloading" || state === "installing") return;
    reset();
    onClose();
  }, [state, reset, onClose]);

  const progressCallback = useCallback(
    (event: {
      event: string;
      data?: { contentLength?: number; chunkLength?: number };
    }) => {
      if (event.event === "Started") {
        totalSizeRef.current = event.data?.contentLength ?? null;
        setTotalSize(totalSizeRef.current);
      } else if (event.event === "Progress") {
        downloadedRef.current += event.data?.chunkLength ?? 0;
        setDownloaded(downloadedRef.current);
        if (totalSizeRef.current) {
          setProgress((downloadedRef.current / totalSizeRef.current) * 100);
        }
      } else if (event.event === "Finished") {
        setProgress(100);
        setState("installing");
      }
    },
    [],
  );

  const handleUpdate = useCallback(async () => {
    if (!update) return;

    setState("downloading");
    downloadedRef.current = 0;
    totalSizeRef.current = null;

    try {
      const os = await platform();
      if (os === "linux") {
        // On Linux system installs, download the .deb from GitHub and install
        // via pkexec dpkg -i (shows one polkit auth dialog). We do NOT use
        // Tauri's AppImage-based update path — it fails on system installs.
        const unlisten = await listen<{
          downloaded: number;
          total: number | null;
        }>("linux-update-progress", (event) => {
          const { downloaded: dl, total } = event.payload;
          if (total && !totalSizeRef.current) {
            totalSizeRef.current = total;
            setTotalSize(total);
          }
          downloadedRef.current = dl;
          setDownloaded(dl);
          if (totalSizeRef.current) {
            setProgress((dl / totalSizeRef.current) * 100);
          }
        });
        try {
          await invoke("download_and_install_linux", {
            version: update.version,
          });
          setProgress(100);
          setState("installing");
        } finally {
          unlisten();
        }
      } else {
        await update.downloadAndInstall(progressCallback);
      }
      await relaunch();
    } catch (e) {
      setErrorMessage(String(e));
      setState("error");
    }
  }, [update, progressCallback]);

  if (!update) return null;

  return (
    <Modal
      centered
      opened={opened}
      onClose={handleClose}
      title="Update Available"
      closeOnClickOutside={state === "prompt" || state === "error"}
      closeOnEscape={state === "prompt" || state === "error"}
      withCloseButton={state === "prompt" || state === "error"}
    >
      <Stack>
        {state === "prompt" && (
          <>
            <Text>A new version is available.</Text>
            <Text fw="bold">
              v{update.currentVersion} → v{update.version}
            </Text>
            <Group justify="right">
              <Button variant="default" onClick={handleClose}>
                Later
              </Button>
              <Button onClick={handleUpdate}>Update</Button>
            </Group>
          </>
        )}

        {state === "downloading" && (
          <>
            <Text fw="bold">
              v{update.currentVersion} → v{update.version}
            </Text>
            <Progress value={progress} animated size="lg" />
            <Text size="sm" c="dimmed" ta="center">
              Downloading...{" "}
              {totalSize
                ? `${formatMB(downloaded)} / ${formatMB(totalSize)} MB`
                : `${formatMB(downloaded)} MB`}
            </Text>
          </>
        )}

        {state === "installing" && (
          <Text ta="center">
            Installing update... A password prompt may appear. Please approve it
            to complete the update.
          </Text>
        )}

        {state === "error" && (
          <>
            <Text c="red" fw="bold">
              Update failed
            </Text>
            <Text size="sm">{errorMessage}</Text>
            <Group justify="right">
              <Button variant="default" onClick={handleClose}>
                Close
              </Button>
              <Button onClick={reset}>Try Again</Button>
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  );
}

export default UpdateModal;
