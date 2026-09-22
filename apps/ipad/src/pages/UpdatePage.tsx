import { useState, useEffect, useId } from "react";
import Header from "@/components/Header";
import PageTitle from "@/components/PageTitle";
import SplitLayout from "@/components/SplitLayout";
import Button from "@/components/Button";
import { GroupedBody, GroupedSection, Notice } from "@/components/Grouped";
import {
  AlertIcon,
  CheckCircleIcon,
  CheckIcon,
  DownloadIcon,
  FolderIcon,
  PackageIcon,
  RefreshIcon,
  RollbackIcon,
  ShieldIcon,
} from "@/components/icons";
import { useUpdater, type UpdateState } from "@/hooks/useUpdater";
import { getServerUrl, setServerUrl } from "@/data/settings";
import { getPackageState } from "@/data/packages";
import { getPublicKey, setPublicKey } from "@/data/signature";
import { UP_TO_DATE } from "@/data/updater";

interface UpdatePageProps {
  back: () => void;
  onContentChanged: () => void;
}

/** Which section started the current operation, so its result is shown
 *  next to the button the user pressed rather than somewhere off screen. */
type Origin = "online" | "import" | "rollback";

// 16px+ text stops iOS zooming the page when a field is focused.
const INPUT =
  "h-11 min-w-0 flex-1 rounded-xl bg-surface-2 px-3.5 text-base text-ink ring-1 ring-inset ring-transparent outline-none transition placeholder:text-ink-3 focus:bg-surface focus:ring-2 focus:ring-accent";

export default function UpdatePage({ back, onContentChanged }: UpdatePageProps) {
  const { state, check, download, scanImports, importDir, rollback, reset } =
    useUpdater(onContentChanged);
  const [url, setUrl] = useState(getServerUrl);
  const [savedUrl, setSavedUrl] = useState(getServerUrl);
  const [canRollback, setCanRollback] = useState(false);
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [importingDir, setImportingDir] = useState<string | null>(null);
  const [confirmingRollback, setConfirmingRollback] = useState(false);
  const urlId = useId();

  useEffect(() => {
    getPackageState().then((s) => setCanRollback(s.previous !== null));
  }, [state.status]);

  const urlDirty = url.trim() !== savedUrl;

  function saveUrl() {
    setServerUrl(url.trim());
    const normalised = getServerUrl();
    setSavedUrl(normalised);
    setUrl(normalised);
  }

  function handleCheck() {
    // The updater reads the saved URL, so an edited but unsaved address
    // would otherwise be ignored.
    if (urlDirty) saveUrl();
    setOrigin("online");
    check();
  }

  function handleScan() {
    setOrigin("import");
    scanImports();
  }

  async function handleImport(dir: string) {
    setOrigin("import");
    setImportingDir(dir);
    await importDir(dir);
    setImportingDir(null);
  }

  async function handleRollback() {
    setOrigin("rollback");
    await rollback();
    setConfirmingRollback(false);
  }

  function finish() {
    reset();
    back();
  }

  const busy =
    state.status === "checking" ||
    state.status === "downloading" ||
    state.status === "activating" ||
    state.status === "importing" ||
    state.status === "scanning" ||
    state.status === "rolling-back";

  return (
    <div className="min-h-screen bg-canvas">
      <Header title="Content updates" onBack={back} backLabel="Back" titleInPortraitOnly />

      <SplitLayout
        intro={
          <PageTitle eyebrow="Settings" title="Content updates">
            <p>Keep this iPad’s skills library current from your CMS server, or from a package copied onto the device.</p>
          </PageTitle>
        }
      >

        <GroupedSection title="Online update">
          <GroupedBody>
            <label htmlFor={urlId} className="block text-[0.9375rem] font-medium text-ink">
              CMS server URL
            </label>
            <div className="mt-2 flex gap-2">
              <input
                id={urlId}
                type="url"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://skills.example.nhs.uk"
                className={INPUT}
              />
              <Button
                variant="secondary"
                onClick={saveUrl}
                disabled={!urlDirty}
                icon={!urlDirty && savedUrl ? <CheckIcon className="h-4 w-4" /> : undefined}
              >
                {!urlDirty && savedUrl ? "Saved" : "Save"}
              </Button>
            </div>
          </GroupedBody>

          <GroupedBody className="border-t border-line">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="max-w-sm text-[0.9375rem] leading-relaxed text-ink-2">
                Check the server for a newer content package.
              </p>
              <Button
                icon={<RefreshIcon className="h-4 w-4" />}
                busy={state.status === "checking"}
                disabled={busy || !url.trim()}
                onClick={handleCheck}
              >
                {state.status === "checking" ? "Checking…" : "Check for updates"}
              </Button>
            </div>

            {state.status === "available" && state.manifest && (
              <div className="mt-5 flex animate-fade-in flex-wrap items-center gap-4 rounded-xl bg-accent-soft p-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-on-accent">
                  <PackageIcon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1 text-accent-ink" role="status">
                  <p className="font-semibold">Version {state.manifest.release_version} is available</p>
                  <p className="text-[0.9375rem]">
                    {state.manifest.counts.skills} skills · {state.manifest.counts.resources} resources ·{" "}
                    {formatBytes(state.manifest.total_uncompressed_bytes)}
                  </p>
                </div>
                <Button icon={<DownloadIcon className="h-4 w-4" />} onClick={download}>
                  Download and install
                </Button>
              </div>
            )}

            {(state.status === "downloading" || state.status === "activating") && state.progress && (
              <ProgressBar progress={state.progress} activating={state.status === "activating"} />
            )}

            {origin === "online" && <Outcome state={state} failedTitle="Update failed" problemTitle="Couldn’t check for updates" onDone={finish} />}
          </GroupedBody>
        </GroupedSection>

        <GroupedSection title="Manual import">
          <GroupedBody>
            <p className="text-[0.9375rem] leading-relaxed text-ink-2">
              In the Files app, copy a content package folder into{" "}
              <span className="font-medium text-ink">On My iPad › SkillsLab › import</span>, then scan for it here.
            </p>
            <Button
              className="mt-4"
              variant="secondary"
              icon={<FolderIcon className="h-4 w-4" />}
              busy={state.status === "scanning"}
              disabled={busy}
              onClick={handleScan}
            >
              {state.status === "scanning" ? "Scanning…" : "Scan for packages"}
            </Button>

            {origin === "import" && <Outcome state={state} failedTitle="Import failed" problemTitle="Nothing to import" onDone={finish} />}
          </GroupedBody>

          {state.importDirs.length > 0 && (
            <ul className="divide-y divide-line border-t border-line" aria-label="Packages found">
              {state.importDirs.map((dir) => {
                const name = dir.replace("import/", "");
                return (
                  <li key={dir} className="flex min-h-16 items-center gap-3.5 px-5 py-2.5">
                    <PackageIcon className="h-5 w-5 shrink-0 text-ink-3" />
                    <span className="min-w-0 flex-1 truncate text-[0.9375rem] font-medium">{name}</span>
                    <Button
                      variant="tinted"
                      busy={importingDir === dir}
                      disabled={busy}
                      onClick={() => handleImport(dir)}
                      aria-label={`Import ${name}`}
                    >
                      {importingDir === dir ? "Importing…" : "Import"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </GroupedSection>

        <SignatureSection />

        {(canRollback || origin === "rollback") && (
          <GroupedSection title="Rollback">
            <GroupedBody>
              {confirmingRollback ? (
                <div className="animate-fade-in rounded-xl bg-danger-soft p-4 text-danger-ink" role="group" aria-label="Confirm rollback">
                  <p className="font-semibold">Roll back to the previous content?</p>
                  <p className="mt-0.5 text-[0.9375rem] leading-relaxed">
                    The installed content will be replaced by the package that was installed before it.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      variant="destructive"
                      busy={state.status === "rolling-back"}
                      onClick={handleRollback}
                    >
                      {state.status === "rolling-back" ? "Rolling back…" : "Roll back"}
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={state.status === "rolling-back"}
                      onClick={() => setConfirmingRollback(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <p className="max-w-sm text-[0.9375rem] leading-relaxed text-ink-2">
                    Replace the current content with the previously installed package.
                  </p>
                  {canRollback && (
                    <Button
                      variant="danger"
                      icon={<RollbackIcon className="h-4 w-4" />}
                      disabled={busy}
                      onClick={() => setConfirmingRollback(true)}
                    >
                      Roll back…
                    </Button>
                  )}
                </div>
              )}

              {origin === "rollback" && (
                <Outcome
                  state={state}
                  failedTitle="Rollback failed"
                  problemTitle="Couldn’t roll back"
                  doneTitle="Rolled back"
                  doneBody="The previously installed content has been restored."
                  onDone={finish}
                />
              )}
            </GroupedBody>
          </GroupedSection>
        )}
      </SplitLayout>
    </div>
  );
}

/** The result of the last operation: success, "up to date", or a problem. */
function Outcome({
  state,
  failedTitle,
  problemTitle,
  doneTitle = "Content updated",
  doneBody = "The skills library now shows the new content.",
  onDone,
}: {
  state: UpdateState;
  failedTitle: string;
  /** Title for a problem that stopped an operation before it began. */
  problemTitle: string;
  doneTitle?: string;
  doneBody?: string;
  onDone: () => void;
}) {
  let notice: React.ReactNode = null;

  if (state.status === "done") {
    notice = (
      <Notice
        tone="success"
        icon={<CheckCircleIcon className="h-5 w-5" />}
        title={doneTitle}
        action={<Button onClick={onDone}>Done</Button>}
      >
        {doneBody}
      </Notice>
    );
  } else if (state.error === UP_TO_DATE) {
    notice = (
      <Notice tone="success" icon={<CheckCircleIcon className="h-5 w-5" />} title="You’re up to date">
        This iPad already has the latest content.
      </Notice>
    );
  } else if (state.error) {
    notice = (
      <Notice
        tone="warning"
        icon={<AlertIcon className="h-5 w-5" />}
        title={state.status === "error" ? failedTitle : problemTitle}
      >
        {state.error}
      </Notice>
    );
  }

  return notice && <div className="mt-5">{notice}</div>;
}

function ProgressBar({
  progress,
  activating,
}: {
  progress: { filesTotal: number; filesDone: number; bytesTotal: number; bytesDownloaded: number };
  activating: boolean;
}) {
  const labelId = useId();
  const pct = progress.bytesTotal > 0
    ? Math.round((progress.bytesDownloaded / progress.bytesTotal) * 100)
    : 0;

  return (
    <div className="mt-5">
      <div className="flex items-center justify-between text-[0.9375rem]">
        <span id={labelId} className="text-ink">
          {activating
            ? "Installing content…"
            : `Downloading file ${progress.filesDone} of ${progress.filesTotal}`}
        </span>
        {!activating && <span className="tabular-nums text-ink-2">{pct}%</span>}
      </div>
      <div
        role="progressbar"
        aria-labelledby={labelId}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={activating ? undefined : pct}
        className="mt-2 h-2 overflow-hidden rounded-full bg-surface-3"
      >
        <div
          className={`h-full rounded-full bg-accent transition-[width] duration-300 ${activating ? "animate-pulse" : ""}`}
          style={{ width: `${activating ? 100 : pct}%` }}
        />
      </div>
      {!activating && progress.bytesTotal > 0 && (
        <p className="mt-1.5 text-[0.8125rem] tabular-nums text-ink-3">
          {formatBytes(progress.bytesDownloaded)} of {formatBytes(progress.bytesTotal)}
        </p>
      )}
    </div>
  );
}

function SignatureSection() {
  const [key, setKey] = useState(getPublicKey);
  // Tracked in state so the status updates as soon as a key is saved.
  const [savedKey, setSavedKey] = useState(getPublicKey);
  const keyId = useId();
  const enforced = savedKey.length > 0;
  const dirty = key.trim() !== savedKey;

  function handleSave() {
    setPublicKey(key.trim());
    setSavedKey(key.trim());
    setKey(key.trim());
  }

  function handleClear() {
    setKey("");
    setPublicKey("");
    setSavedKey("");
  }

  return (
    <GroupedSection
      title="Signature verification"
      footer="Paste a base64-encoded Ed25519 public key (32 bytes). When a key is set, only content packages signed with it are accepted."
    >
      <GroupedBody>
        <div className="flex items-center gap-3.5">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              enforced ? "bg-success-soft text-success-ink" : "bg-surface-2 text-ink-3"
            }`}
          >
            <ShieldIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1" role="status">
            <p className="text-[0.9375rem] font-medium">{enforced ? "Enforced" : "Not configured"}</p>
            <p className="text-[0.8125rem] text-ink-3">
              {enforced ? "Only signed packages are accepted" : "Packages are accepted without a signature"}
            </p>
          </div>
        </div>

        <label htmlFor={keyId} className="mt-5 block text-[0.9375rem] font-medium text-ink">
          Public key
        </label>
        <div className="mt-2 flex gap-2">
          <input
            id={keyId}
            type="text"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Base64 public key"
            className={`${INPUT} font-mono`}
          />
          <Button variant="secondary" onClick={handleSave} disabled={!dirty || !key.trim()}>
            Save
          </Button>
          {enforced && (
            <Button variant="danger" onClick={handleClear}>
              Clear
            </Button>
          )}
        </div>
      </GroupedBody>
    </GroupedSection>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
