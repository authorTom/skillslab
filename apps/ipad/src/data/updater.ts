import { Filesystem, Directory } from "@capacitor/filesystem";
import { Network } from "@capacitor/network";
import { assetFileExists, CONTENT_DIR } from "./assets";
import {
  validateManifest,
  cleanStaging,
  activate,
  getPackageState,
} from "./packages";
import { getServerUrl, getLastEtag, setLastEtag } from "./settings";
import type { ReleaseManifest } from "./types";

export interface UpdateProgress {
  phase: "checking" | "downloading" | "activating";
  filesTotal: number;
  filesDone: number;
  bytesTotal: number;
  bytesDownloaded: number;
}

export interface UpdateResult {
  ok: true;
  manifest: ReleaseManifest;
}

export interface UpdateError {
  ok: false;
  error: string;
}

export async function checkForUpdate(): Promise<
  | { available: true; manifest: ReleaseManifest }
  | { available: false; reason: string }
> {
  const serverUrl = getServerUrl();
  if (!serverUrl) {
    return { available: false, reason: "No server URL configured." };
  }

  const status = await Network.getStatus();
  if (!status.connected) {
    return { available: false, reason: "No network connection." };
  }

  const headers: Record<string, string> = {};
  const etag = getLastEtag();
  if (etag) headers["If-None-Match"] = etag;

  let response: Response;
  try {
    response = await fetch(`${serverUrl}/api/offline/releases/latest`, { headers });
  } catch {
    return { available: false, reason: "Could not reach the server." };
  }

  if (response.status === 304) {
    return { available: false, reason: "Content is up to date." };
  }

  if (!response.ok) {
    if (response.status === 404) {
      return { available: false, reason: "No release published on the server." };
    }
    return { available: false, reason: `Server returned ${response.status}.` };
  }

  const manifest: ReleaseManifest = await response.json();
  const errors = validateManifest(manifest);
  if (errors.length > 0) {
    return { available: false, reason: errors.join(" ") };
  }

  const state = await getPackageState();
  if (state.current?.releaseId === manifest.release_id) {
    const newEtag = response.headers.get("ETag");
    if (newEtag) setLastEtag(newEtag);
    return { available: false, reason: "Content is up to date." };
  }

  return { available: true, manifest };
}

export async function downloadAndActivate(
  manifest: ReleaseManifest,
  onProgress: (progress: UpdateProgress) => void
): Promise<UpdateResult | UpdateError> {
  const serverUrl = getServerUrl();
  if (!serverUrl) return { ok: false, error: "No server URL configured." };

  const releaseId = manifest.release_id;
  const baseUrl = `${serverUrl}/api/offline/releases/${encodeURIComponent(releaseId)}/download`;

  await cleanStaging();

  const filesToDownload: { remotePath: string; stagingPath: string; bytes: number }[] = [];

  filesToDownload.push({
    remotePath: "catalogue.sqlite",
    stagingPath: "catalogue.sqlite",
    bytes: manifest.catalogue.bytes,
  });

  for (const asset of manifest.assets) {
    const alreadyActive = await assetFileExists(asset.path);
    if (!alreadyActive) {
      filesToDownload.push({
        remotePath: asset.path,
        stagingPath: asset.path,
        bytes: asset.bytes,
      });
    }
  }

  const totalBytes = filesToDownload.reduce((sum, f) => sum + f.bytes, 0);
  let bytesDownloaded = 0;

  onProgress({
    phase: "downloading",
    filesTotal: filesToDownload.length,
    filesDone: 0,
    bytesTotal: totalBytes,
    bytesDownloaded: 0,
  });

  for (let i = 0; i < filesToDownload.length; i++) {
    const file = filesToDownload[i];
    const url = `${baseUrl}?file=${encodeURIComponent(file.remotePath)}`;

    try {
      await downloadToStaging(url, file.stagingPath);
    } catch (err) {
      await cleanStaging();
      return {
        ok: false,
        error: `Failed to download ${file.remotePath}: ${err instanceof Error ? err.message : "unknown error"}`,
      };
    }

    bytesDownloaded += file.bytes;
    onProgress({
      phase: "downloading",
      filesTotal: filesToDownload.length,
      filesDone: i + 1,
      bytesTotal: totalBytes,
      bytesDownloaded,
    });
  }

  // For assets that already existed, copy them to staging so activate() can find them
  // Actually, activate() copies from staging to content/assets, and existing ones are already there
  // We only need the staged catalogue to be present

  onProgress({
    phase: "activating",
    filesTotal: filesToDownload.length,
    filesDone: filesToDownload.length,
    bytesTotal: totalBytes,
    bytesDownloaded: totalBytes,
  });

  try {
    await activate(manifest);
  } catch (err) {
    return {
      ok: false,
      error: `Activation failed: ${err instanceof Error ? err.message : "unknown error"}`,
    };
  }

  setLastEtag(`"${manifest.release_id}"`);

  return { ok: true, manifest };
}

async function downloadToStaging(url: string, stagingPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const blob = await response.blob();
  const reader = new FileReader();
  const base64 = await new Promise<string>((resolve, reject) => {
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64Data = result.split(",")[1] ?? "";
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  await Filesystem.writeFile({
    path: `staging/${stagingPath}`,
    directory: Directory.Documents,
    data: base64,
    recursive: true,
  });
}

export async function importFromDirectory(dirPath: string): Promise<UpdateResult | UpdateError> {
  try {
    const manifestData = await Filesystem.readFile({
      path: `${dirPath}/manifest.json`,
      directory: Directory.Documents,
      encoding: "utf8" as never,
    });
    const manifest: ReleaseManifest = JSON.parse(manifestData.data as string);

    const errors = validateManifest(manifest);
    if (errors.length > 0) {
      return { ok: false, error: errors.join(" ") };
    }

    const state = await getPackageState();
    if (state.current?.releaseId === manifest.release_id) {
      return { ok: false, error: "This release is already active." };
    }

    await cleanStaging();

    // Copy catalogue to staging
    await Filesystem.copy({
      from: `${dirPath}/catalogue.sqlite`,
      directory: Directory.Documents,
      to: "staging/catalogue.sqlite",
      toDirectory: Directory.Documents,
    });

    // Copy assets to staging
    for (const asset of manifest.assets) {
      const alreadyActive = await assetFileExists(asset.path);
      if (!alreadyActive) {
        try {
          await Filesystem.copy({
            from: `${dirPath}/${asset.path}`,
            directory: Directory.Documents,
            to: `staging/${asset.path}`,
            toDirectory: Directory.Documents,
          });
        } catch {
          await cleanStaging();
          return { ok: false, error: `Missing asset: ${asset.path}` };
        }
      }
    }

    await activate(manifest);
    return { ok: true, manifest };
  } catch (err) {
    await cleanStaging();
    return {
      ok: false,
      error: `Import failed: ${err instanceof Error ? err.message : "unknown error"}`,
    };
  }
}

export async function listImportableDirectories(): Promise<string[]> {
  const dirs: string[] = [];
  try {
    const result = await Filesystem.readdir({
      path: "import",
      directory: Directory.Documents,
    });
    for (const entry of result.files) {
      if (entry.type === "directory") {
        try {
          await Filesystem.stat({
            path: `import/${entry.name}/manifest.json`,
            directory: Directory.Documents,
          });
          dirs.push(`import/${entry.name}`);
        } catch {
          // No manifest.json in this directory
        }
      }
    }
  } catch {
    // import/ directory doesn't exist
  }
  return dirs;
}
