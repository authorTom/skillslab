import { useState, useCallback } from "react";
import type { ReleaseManifest } from "@/data/types";
import type { UpdateProgress } from "@/data/updater";
import {
  checkForUpdate,
  downloadAndActivate,
  importFromDirectory,
  listImportableDirectories,
} from "@/data/updater";
import { rollback } from "@/data/packages";

export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "activating"
  | "done"
  | "error"
  | "scanning"
  | "importing"
  | "rolling-back";

export interface UpdateState {
  status: UpdateStatus;
  manifest: ReleaseManifest | null;
  progress: UpdateProgress | null;
  error: string | null;
  importDirs: string[];
}

export function useUpdater(onContentChanged: () => void) {
  const [state, setState] = useState<UpdateState>({
    status: "idle",
    manifest: null,
    progress: null,
    error: null,
    importDirs: [],
  });

  const check = useCallback(async () => {
    setState((s) => ({ ...s, status: "checking", error: null }));
    const result = await checkForUpdate();
    if (result.available) {
      setState((s) => ({ ...s, status: "available", manifest: result.manifest }));
    } else {
      setState((s) => ({ ...s, status: "idle", error: result.reason }));
    }
  }, []);

  const download = useCallback(async () => {
    if (!state.manifest) return;
    const manifest = state.manifest;
    setState((s) => ({ ...s, status: "downloading", error: null }));

    const result = await downloadAndActivate(manifest, (progress) => {
      setState((s) => ({
        ...s,
        status: progress.phase === "activating" ? "activating" : "downloading",
        progress,
      }));
    });

    if (result.ok) {
      setState((s) => ({ ...s, status: "done", progress: null }));
      onContentChanged();
    } else {
      setState((s) => ({ ...s, status: "error", error: result.error, progress: null }));
    }
  }, [state.manifest, onContentChanged]);

  const scanImports = useCallback(async () => {
    setState((s) => ({ ...s, status: "scanning", error: null }));
    const dirs = await listImportableDirectories();
    if (dirs.length === 0) {
      setState((s) => ({
        ...s,
        status: "idle",
        error: 'No content packages found in the "import" folder.',
        importDirs: [],
      }));
    } else {
      setState((s) => ({ ...s, status: "idle", importDirs: dirs }));
    }
  }, []);

  const importDir = useCallback(
    async (dirPath: string) => {
      setState((s) => ({ ...s, status: "importing", error: null }));
      const result = await importFromDirectory(dirPath);
      if (result.ok) {
        setState((s) => ({ ...s, status: "done", importDirs: [] }));
        onContentChanged();
      } else {
        setState((s) => ({ ...s, status: "error", error: result.error }));
      }
    },
    [onContentChanged]
  );

  const doRollback = useCallback(async () => {
    setState((s) => ({ ...s, status: "rolling-back", error: null }));
    try {
      await rollback();
      setState((s) => ({ ...s, status: "done" }));
      onContentChanged();
    } catch (err) {
      setState((s) => ({
        ...s,
        status: "error",
        error: err instanceof Error ? err.message : "Rollback failed.",
      }));
    }
  }, [onContentChanged]);

  const reset = useCallback(() => {
    setState({ status: "idle", manifest: null, progress: null, error: null, importDirs: [] });
  }, []);

  return { state, check, download, scanImports, importDir, rollback: doRollback, reset };
}
