import { Button, Group, Modal, Progress, Stack, Text } from "@mantine/core";
import { relaunch } from "@tauri-apps/plugin-process";
import type { Update } from "@tauri-apps/plugin-updater";
import { useCallback, useRef, useState } from "react";

type UpdateState = "prompt" | "downloading" | "installing";

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
  const downloadedRef = useRef(0);

  const reset = useCallback(() => {
    setState("prompt");
    setProgress(0);
    setDownloaded(0);
    setTotalSize(null);
    downloadedRef.current = 0;
  }, []);

  const handleClose = useCallback(() => {
    if (state === "downloading" || state === "installing") return;
    reset();
    onClose();
  }, [state, reset, onClose]);

  const totalSizeRef = useRef<number | null>(null);

  const handleUpdate = useCallback(async () => {
    if (!update) return;

    setState("downloading");
    downloadedRef.current = 0;
    totalSizeRef.current = null;

    await update.downloadAndInstall((event) => {
      if (event.event === "Started") {
        totalSizeRef.current = event.data.contentLength ?? null;
        setTotalSize(totalSizeRef.current);
      } else if (event.event === "Progress") {
        downloadedRef.current += event.data.chunkLength;
        setDownloaded(downloadedRef.current);
        if (totalSizeRef.current) {
          setProgress((downloadedRef.current / totalSizeRef.current) * 100);
        }
      } else if (event.event === "Finished") {
        setProgress(100);
        setState("installing");
      }
    });

    await relaunch();
  }, [update]);

  if (!update) return null;

  return (
    <Modal
      centered
      opened={opened}
      onClose={handleClose}
      title="Update Available"
      closeOnClickOutside={state === "prompt"}
      closeOnEscape={state === "prompt"}
      withCloseButton={state === "prompt"}
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
          <Text ta="center">Installing update and restarting...</Text>
        )}
      </Stack>
    </Modal>
  );
}

export default UpdateModal;
