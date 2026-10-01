import { useState } from "react";
import { listImportableDirectories } from "@/data/updater";
import { hasEnoughSpace, type PackageCandidate } from "@/data/fileInstall";
import { formatBytes, formatDate } from "@/data/format";
import type { FileInstallState } from "@/hooks/useFileInstall";
import Button from "./Button";
import ProgressBar from "./ProgressBar";
import { GroupedBody, GroupedSection, Notice } from "./Grouped";
import { AlertIcon, CheckCircleIcon, FolderIcon, PackageIcon } from "./icons";

interface FileInstallSectionProps {
  state: FileInstallState;
  /** Another update is running, so nothing here can start. */
  disabled: boolean;
  installedVersion: string | null;
  onChoose: () => void;
  onOpenImportFolder: (path: string) => void;
  onInstall: () => void;
  onCancel: () => void;
  onDismiss: () => void;
  onDone: () => void;
}

const KIND_LABEL: Record<PackageCandidate["kind"], string> = {
  new: "New version",
  older: "Older version",
  repair: "Installed version",
};

/** Install a package from a USB drive, AirDrop, Files or the import folder. */
export default function FileInstallSection({
  state,
  disabled,
  installedVersion,
  onChoose,
  onOpenImportFolder,
  onInstall,
  onCancel,
  onDismiss,
  onDone,
}: FileInstallSectionProps) {
  const [importDirs, setImportDirs] = useState<string[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const busy = state.step === "opening" || state.step === "installing";
  const idle = state.step === "idle";

  async function scan() {
    setScanning(true);
    setImportDirs(await listImportableDirectories());
    setScanning(false);
  }

  return (
    <GroupedSection
      title="Install from a file"
      footer={
        <>
          Download a package from the CMS’s Offline releases page, then copy it to a USB drive, AirDrop it to this
          iPad, or save it in Files. A package folder in <span className="font-medium">On My iPad › SkillsLab ›
          import</span> works too.
        </>
      }
    >
      <GroupedBody>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="max-w-sm text-[0.9375rem] leading-relaxed text-ink-2">
            Install a content package (a <span className="font-mono text-[0.875rem]">.skillslab</span> file or a
            package folder) without a network.
          </p>
          <Button
            icon={<PackageIcon className="h-4 w-4" />}
            busy={state.step === "opening"}
            disabled={disabled || busy}
            onClick={onChoose}
          >
            {state.step === "opening" ? "Checking package…" : "Choose package…"}
          </Button>
        </div>

        {state.step === "ready" && (
          <CandidateCard
            candidate={state.candidate}
            installedVersion={installedVersion}
            onInstall={onInstall}
            onDismiss={onDismiss}
          />
        )}

        {state.step === "installing" && <InstallProgress state={state} onCancel={onCancel} />}

        {state.step === "done" && (
          <div className="mt-5">
            <Notice
              tone="success"
              icon={<CheckCircleIcon className="h-5 w-5" />}
              title={state.candidate.kind === "repair" ? "Content repaired" : "Content installed"}
              action={<Button onClick={onDone}>Done</Button>}
            >
              The skills library now shows version {state.candidate.manifest.release_version}.
            </Notice>
          </div>
        )}

        {idle && state.error && (
          <div className="mt-5">
            <Notice tone="warning" icon={<AlertIcon className="h-5 w-5" />} title="Couldn’t install the package">
              {state.error}
            </Notice>
          </div>
        )}
      </GroupedBody>

      <GroupedBody className="border-t border-line">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="max-w-sm text-[0.9375rem] leading-relaxed text-ink-2">
            Look for package folders copied into this app’s import folder.
          </p>
          <Button
            variant="secondary"
            icon={<FolderIcon className="h-4 w-4" />}
            busy={scanning}
            disabled={disabled || busy}
            onClick={scan}
          >
            {scanning ? "Scanning…" : "Scan import folder"}
          </Button>
        </div>
        {importDirs?.length === 0 && (
          <p className="mt-4 text-[0.9375rem] text-ink-2" role="status">
            No package folders found in the import folder.
          </p>
        )}
      </GroupedBody>

      {importDirs && importDirs.length > 0 && (
        <ul className="divide-y divide-line border-t border-line" aria-label="Packages found">
          {importDirs.map((dir) => {
            const name = dir.replace("import/", "");
            return (
              <li key={dir} className="flex min-h-16 items-center gap-3.5 px-5 py-2.5">
                <FolderIcon className="h-5 w-5 shrink-0 text-ink-3" />
                <span className="min-w-0 flex-1 truncate text-[0.9375rem] font-medium">{name}</span>
                <Button
                  variant="tinted"
                  disabled={disabled || busy}
                  onClick={() => onOpenImportFolder(dir)}
                  aria-label={`Open ${name}`}
                >
                  Open
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </GroupedSection>
  );
}

function CandidateCard({
  candidate,
  installedVersion,
  onInstall,
  onDismiss,
}: {
  candidate: PackageCandidate;
  installedVersion: string | null;
  onInstall: () => void;
  onDismiss: () => void;
}) {
  const { manifest, kind } = candidate;
  const roomy = hasEnoughSpace(candidate);
  const published = manifest.created_at ? formatDate(manifest.created_at) : null;

  return (
    <div className="mt-5 animate-fade-in rounded-xl bg-surface-2 p-4 ring-1 ring-line" role="group" aria-label="Package to install">
      <div className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-on-accent">
          <PackageIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="font-semibold">Version {manifest.release_version}</p>
            <span
              className={`rounded-full px-2.5 py-0.5 font-mono text-[0.6875rem] uppercase tracking-[0.08em] ${
                kind === "older" ? "bg-warning-soft text-warning-ink" : "bg-accent-soft text-accent-ink"
              }`}
            >
              {KIND_LABEL[kind]}
            </span>
          </div>
          <p className="mt-0.5 truncate text-[0.8125rem] text-ink-3">{candidate.name}</p>
          <p className="mt-2 text-[0.9375rem] text-ink-2">
            {[published && `Published ${published}`, `${manifest.counts.skills} skills`, `${manifest.counts.resources} resources`]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="mt-1 text-[0.9375rem] tabular-nums text-ink-2">
            Copies {formatBytes(candidate.copyBytes)} · {formatBytes(candidate.freeBytes)} free on this iPad
          </p>
        </div>
      </div>

      {kind === "repair" && (
        <p className="mt-4 text-[0.9375rem] leading-relaxed text-ink">
          {candidate.damagedCount === 0
            ? "This version is already installed and all its files are intact. Installing it again replaces the catalogue."
            : `This version is already installed. ${
                candidate.damagedCount === 1 ? "1 file is" : `${candidate.damagedCount} files are`
              } missing or damaged and will be replaced.`}
        </p>
      )}
      {kind === "older" && (
        <div className="mt-4">
          <Notice tone="warning" icon={<AlertIcon className="h-5 w-5" />} title="Older than the installed content">
            {installedVersion ? `Version ${installedVersion} is installed. ` : ""}Installing this replaces it with older
            content. You can roll back afterwards.
          </Notice>
        </div>
      )}
      {!roomy && (
        <div className="mt-4">
          <Notice tone="danger" icon={<AlertIcon className="h-5 w-5" />} title="Not enough space">
            Installing needs {formatBytes(candidate.copyBytes)} plus some room to spare. Free up space in Settings ›
            General › iPad Storage, then choose the package again.
          </Notice>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={onInstall} disabled={!roomy}>
          {kind === "repair" ? "Repair" : "Install"}
        </Button>
        <Button variant="secondary" onClick={onDismiss}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function InstallProgress({
  state,
  onCancel,
}: {
  state: Extract<FileInstallState, { step: "installing" }>;
  onCancel: () => void;
}) {
  const p = state.progress;
  const copying = !p || p.bytesDone < p.bytesTotal;
  const label = !p
    ? "Preparing…"
    : copying
      ? `Copying file ${Math.min(p.filesDone + 1, p.filesTotal)} of ${p.filesTotal}`
      : "Installing content…";

  return (
    <div className="mt-1">
      <ProgressBar
        label={label}
        value={p && copying && p.bytesTotal > 0 ? p.bytesDone / p.bytesTotal : null}
        detail={p && copying ? `${formatBytes(p.bytesDone)} of ${formatBytes(p.bytesTotal)}` : undefined}
      />
      {copying && (
        <Button variant="plain" className="-ml-3 mt-3" onClick={onCancel}>
          Cancel
        </Button>
      )}
    </div>
  );
}
