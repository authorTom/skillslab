import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

/**
 * The native side of installing content from files (apps/ipad/native/
 * content-package): the system file picker, packages opened from AirDrop or
 * another app, streaming copies that check every file's SHA-256, and checks
 * of the installed files.
 */

/** A package the native side has open, with its manifest.json text. */
export interface OpenedPackage {
  id: string;
  name: string;
  manifest: string;
}

/** A package sent to the app that couldn't be opened. */
export interface UnopenablePackage {
  name: string;
  error: string;
}

export interface FileSpec {
  path: string;
  bytes: number;
  sha256?: string;
}

export interface CopyProgress {
  bytesDone: number;
  bytesTotal: number;
  filesDone: number;
  filesTotal: number;
}

export type FileProblem = "missing" | "size" | "damaged";

interface ContentPackagePlugin {
  choose(): Promise<OpenedPackage | { cancelled: true }>;
  openInDocuments(options: { path: string }): Promise<OpenedPackage>;
  takeOpenedPackage(): Promise<{ package?: OpenedPackage | UnopenablePackage }>;
  /** Copy files from an open package into a folder in Documents. */
  install(options: { id: string; files: FileSpec[]; directory: string }): Promise<void>;
  /** Check files in a folder in Documents. */
  verify(options: {
    directory: string;
    files: FileSpec[];
    checkHashes: boolean;
    /** Off when the sizes on record may not match the files. */
    checkSizes?: boolean;
  }): Promise<{ problems: { path: string; problem: FileProblem }[] }>;
  /** Stop the running install or verify, which then rejects with code CANCELLED. */
  cancel(): Promise<void>;
  close(options: { id: string }): Promise<void>;
  freeSpace(): Promise<{ bytes: number }>;
  addListener(event: "installProgress" | "verifyProgress", listener: (p: CopyProgress) => void): Promise<PluginListenerHandle>;
  addListener(event: "packageOpened", listener: (p: OpenedPackage | UnopenablePackage) => void): Promise<PluginListenerHandle>;
}

export const ContentPackage = registerPlugin<ContentPackagePlugin>("ContentPackage");

/** False in a desktop browser during development, where there's no picker. */
export function canInstallFromFiles(): boolean {
  return Capacitor.isPluginAvailable("ContentPackage");
}

export function isCancelled(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "CANCELLED";
}

export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  const message = (err as { message?: string } | null)?.message;
  return message || fallback;
}
