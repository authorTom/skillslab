import { useState, useCallback } from "react";
import type { ReleaseManifest } from "@/data/types";
import type { UpdateProgress } from "@/data/updater";
import { checkForUpdate, downloadAndActivate } from "@/data/updater";
import { rollback } from "@/data/packages";

export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "activating"
  | "done"
  | "error"
  | "rolling-back";

export interface UpdateState {
  status: UpdateStatus;
  manifest: ReleaseManifest | null;
  progress: UpdateProgress | null;
  error: string | null;
}

export function useUpdater(onContentChanged: () => void) {
  const [state, setState] = useState<UpdateState>({
    status: "idle",
    manifest: null,
    progress: null,
    error: null,
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
    setState({ status: "idle", manifest: null, progress: null, error: null });
  }, []);

  return { state, check, download, rollback: doRollback, reset };
}
