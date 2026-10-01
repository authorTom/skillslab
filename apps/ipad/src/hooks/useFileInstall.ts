import { useCallback, useEffect, useRef, useState } from "react";
import {
  canInstallFromFiles,
  ContentPackage,
  errorMessage,
  isCancelled,
  type CopyProgress,
  type OpenedPackage,
  type UnopenablePackage,
} from "@/data/contentPackage";
import { closeCandidate, installCandidate, prepareCandidate, type PackageCandidate } from "@/data/fileInstall";

export type FileInstallState =
  | { step: "idle"; error?: string }
  | { step: "opening" }
  | { step: "ready"; candidate: PackageCandidate }
  | { step: "installing"; candidate: PackageCandidate; progress: CopyProgress | null }
  | { step: "done"; candidate: PackageCandidate };

/**
 * Installing from a file: choose (or receive) a package, review it, install
 * it. A package left open when the screen closes is released, which also
 * deletes an AirDropped copy.
 */
export function useFileInstall(onContentChanged: () => void) {
  const [state, setState] = useState<FileInstallState>({ step: "idle" });
  const current = useRef(state);
  const changed = useRef(onContentChanged);

  useEffect(() => {
    current.current = state;
    changed.current = onContentChanged;
  });

  const openWith = useCallback(async (open: () => Promise<OpenedPackage | { cancelled: true }>) => {
    const s = current.current;
    if (s.step === "installing" || s.step === "opening") return;
    if (s.step === "ready") await closeCandidate(s.candidate);
    setState({ step: "opening" });
    try {
      const opened = await open();
      if ("cancelled" in opened) {
        setState({ step: "idle" });
        return;
      }
      setState({ step: "ready", candidate: await prepareCandidate(opened) });
    } catch (err) {
      setState({ step: "idle", error: errorMessage(err, "Couldn’t open the package.") });
    }
  }, []);

  const choose = useCallback(() => openWith(() => ContentPackage.choose()), [openWith]);

  const openImportFolder = useCallback(
    (path: string) => openWith(() => ContentPackage.openInDocuments({ path })),
    [openWith]
  );

  const receive = useCallback(
    async (opened: OpenedPackage | UnopenablePackage | undefined) => {
      if (!opened) return;
      if ("error" in opened) {
        setState({ step: "idle", error: `${opened.name}: ${opened.error}` });
        return;
      }
      await openWith(async () => opened);
    },
    [openWith]
  );

  /** Pick up a package sent by AirDrop or "Open in", if one is waiting.
   *  During an install it stays waiting until the screen next opens. */
  const takeOpened = useCallback(() => {
    if (current.current.step === "installing" || current.current.step === "opening") return;
    void ContentPackage.takeOpenedPackage().then(({ package: opened }) => receive(opened));
  }, [receive]);

  const install = useCallback(async () => {
    const s = current.current;
    if (s.step !== "ready") return;
    const { candidate } = s;
    setState({ step: "installing", candidate, progress: null });
    try {
      await installCandidate(candidate, (progress) =>
        setState((prev) => (prev.step === "installing" ? { ...prev, progress } : prev))
      );
      await closeCandidate(candidate);
      setState({ step: "done", candidate });
      changed.current();
    } catch (err) {
      if (isCancelled(err)) {
        // Still open, so it can be installed again.
        setState({ step: "ready", candidate });
        return;
      }
      await closeCandidate(candidate);
      setState({ step: "idle", error: errorMessage(err, "The package couldn’t be installed.") });
    }
  }, []);

  const cancel = useCallback(() => {
    void ContentPackage.cancel();
  }, []);

  const dismiss = useCallback(async () => {
    const s = current.current;
    if (s.step === "ready") await closeCandidate(s.candidate);
    setState({ step: "idle" });
  }, []);

  // Packages that arrive while this screen is open, and one that brought
  // the app here.
  useEffect(() => {
    if (!canInstallFromFiles()) return;
    takeOpened();
    const handle = ContentPackage.addListener("packageOpened", takeOpened);
    return () => {
      void handle.then((h) => h.remove());
    };
  }, [takeOpened]);

  useEffect(
    () => () => {
      const s = current.current;
      if (s.step === "ready") void closeCandidate(s.candidate);
    },
    []
  );

  return { state, choose, openImportFolder, install, cancel, dismiss };
}
