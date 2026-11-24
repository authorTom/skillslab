import { useState, useEffect, useId } from "react";
import Header from "@/components/Header";
import PageTitle from "@/components/PageTitle";
import SplitLayout from "@/components/SplitLayout";
import Button from "@/components/Button";
import FileInstallSection from "@/components/FileInstallSection";
import ProgressBar from "@/components/ProgressBar";
import { GroupedBody, GroupedSection, Notice } from "@/components/Grouped";
import {
  AlertIcon,
  CheckCircleIcon,
  CheckIcon,
  DownloadIcon,
  PackageIcon,
  RefreshIcon,
  RollbackIcon,
  ShieldIcon,
} from "@/components/icons";
import { useUpdater, type UpdateState } from "@/hooks/useUpdater";
import { useFileInstall } from "@/hooks/useFileInstall";
import { canInstallFromFiles } from "@/data/contentPackage";
import { formatBytes } from "@/data/format";
import type { UpdateProgress } from "@/data/updater";
import { checkServerUrl, getServerUrl, getServerUrlSetting, setServerUrl } from "@/data/settings";
import { SOURCE_LABELS, type ResolvedSetting } from "@/data/provisioning";
import { useProvisioning } from "@/hooks/useProvisioning";
import { useContentBusy } from "@/hooks/useContentBusy";
import { getPackageState } from "@/data/packages";
import { canEditPublicKey, getPublicKey, getPublicKeySetting, setPublicKey } from "@/data/signature";
import { UP_TO_DATE } from "@/data/updater";

interface UpdatePageProps {
  back: () => void;
  onContentChanged: () => void;
}

/** Which section started the current operation, so its result is shown
 *  next to the button the user pressed rather than somewhere off screen. */
type Origin = "online" | "rollback";

// 16px+ text stops iOS zooming the page when a field is focused.
const INPUT =
  "h-11 min-w-0 flex-1 rounded-xl bg-surface-2 px-3.5 text-base text-ink ring-1 ring-inset ring-transparent outline-none transition placeholder:text-ink-3 focus:bg-surface focus:ring-2 focus:ring-accent";

export default function UpdatePage({ back, onContentChanged }: UpdatePageProps) {
  const { state, check, download, rollback, reset } = useUpdater(onContentChanged);
  const files = useFileInstall(onContentChanged);
  const contentBusy = useContentBusy();
  const [url, setUrl] = useState(getServerUrl);
  const [savedUrl, setSavedUrl] = useState(getServerUrl);
  const [canRollback, setCanRollback] = useState(false);
  const [installedVersion, setInstalledVersion] = useState<string | null>(null);
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [confirmingRollback, setConfirmingRollback] = useState(false);
  const urlId = useId();

  useEffect(() => {
    getPackageState().then((s) => {
      setCanRollback(s.previous !== null);
      setInstalledVersion(s.current?.version ?? null);
    });
  }, [state.status, files.state.step]);

  useProvisioning();
  const serverSetting = getServerUrlSetting();
  const urlLocked = serverSetting.source === "managed" || serverSetting.source === "build";
  const urlDirty = !urlLocked && url.trim() !== savedUrl;

  const [urlError, setUrlError] = useState<string | null>(null);
  const urlErrorId = useId();

  /** Saves the address if it is valid, showing why not otherwise. */
  function saveUrl(): boolean {
    const result = checkServerUrl(url);
    if (!result.ok) {
      setUrlError(result.error);
      return false;
    }
    setUrlError(null);
    setServerUrl(result.url);
    const normalised = getServerUrl();
    setSavedUrl(normalised);
    setUrl(normalised);
    return true;
  }

  function handleCheck() {
    // The updater reads the saved URL, so an edited but unsaved address
    // would otherwise be ignored.
    if (urlDirty && !saveUrl()) return;
    setOrigin("online");
    check();
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

  const onlineBusy =
    state.status === "checking" ||
    state.status === "downloading" ||
    state.status === "activating" ||
    state.status === "rolling-back";
  const fileBusy = files.state.step === "opening" || files.state.step === "installing";
  // Also true for a content check started from Settings.
  const busy = onlineBusy || fileBusy || contentBusy;

  return (
    <div className="min-h-screen bg-canvas">
      <Header title="Content updates" onBack={back} backLabel="Back" backDisabled={contentBusy} titleInPortraitOnly />

      <SplitLayout
        intro={
          <PageTitle eyebrow="Settings" title="Content updates">
            <p>Keep this iPad’s skills library current from your CMS server, or from a package copied onto the device.</p>
            {contentBusy && (
              <p className="mt-4 text-[0.9375rem] font-medium text-ink" role="status">
                Stay on this screen until the update finishes. The iPad won’t lock in the meantime.
              </p>
            )}
          </PageTitle>
        }
      >

        {canInstallFromFiles() && (
          <FileInstallSection
            state={files.state}
            disabled={onlineBusy}
            installedVersion={installedVersion}
            onChoose={files.choose}
            onOpenImportFolder={files.openImportFolder}
            onInstall={files.install}
            onCancel={files.cancel}
            onDismiss={files.dismiss}
            onDone={back}
          />
        )}

        <GroupedSection title="Online update">
          <GroupedBody>
            {urlLocked ? (
              <LockedSetting label="CMS server URL" setting={serverSetting} />
            ) : (
            <>
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
                onChange={(e) => {
                  setUrl(e.target.value);
                  setUrlError(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && urlDirty && saveUrl()}
                placeholder="https://skillslab.trust.internal"
                aria-invalid={urlError ? true : undefined}
                aria-describedby={urlError ? urlErrorId : undefined}
                className={`${INPUT}${urlError ? " ring-2 ring-danger" : ""}`}
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
            {urlError && (
              <p id={urlErrorId} role="alert" className="mt-2 text-[0.875rem] text-danger-ink">
                {urlError}
              </p>
            )}
            </>
            )}
          </GroupedBody>

          <GroupedBody className="border-t border-line">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="max-w-sm text-[0.9375rem] leading-relaxed text-ink-2">
                Check the server for a newer content package.
              </p>
              <Button
                icon={<RefreshIcon className="h-4 w-4" />}
                busy={state.status === "checking"}
                disabled={busy || !(urlLocked ? serverSetting.value : url.trim())}
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
                <Button icon={<DownloadIcon className="h-4 w-4" />} disabled={fileBusy || contentBusy} onClick={download}>
                  Download and install
                </Button>
              </div>
            )}

            {(state.status === "downloading" || state.status === "activating") && state.progress && (
              <DownloadProgress progress={state.progress} activating={state.status === "activating"} />
            )}

            {origin === "online" && <Outcome state={state} failedTitle="Update failed" problemTitle="Couldn’t check for updates" onDone={finish} />}
          </GroupedBody>
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

function DownloadProgress({ progress, activating }: { progress: UpdateProgress; activating: boolean }) {
  if (activating) return <ProgressBar label="Installing content…" value={null} />;
  return (
    <ProgressBar
      label={`Downloading file ${progress.filesDone} of ${progress.filesTotal}`}
      value={progress.bytesTotal > 0 ? progress.bytesDownloaded / progress.bytesTotal : 0}
      detail={
        progress.bytesTotal > 0
          ? `${formatBytes(progress.bytesDownloaded)} of ${formatBytes(progress.bytesTotal)}`
          : undefined
      }
    />
  );
}

/** A setting that comes from the MDM or the build: shown, not editable. */
function LockedSetting({ label, setting }: { label: string; setting: ResolvedSetting }) {
  return (
    <div>
      <p className="text-[0.9375rem] font-medium text-ink">{label}</p>
      <p className="mt-2 break-all rounded-xl bg-surface-2 px-3.5 py-2.5 font-mono text-[0.9375rem] text-ink">
        {setting.value}
      </p>
      {setting.source && <p className="mt-1.5 text-[0.8125rem] text-ink-3">{SOURCE_LABELS[setting.source]}</p>}
    </div>
  );
}

function SignatureSection() {
  useProvisioning();
  const setting = getPublicKeySetting();
  const editable = canEditPublicKey();
  const [key, setKey] = useState(getPublicKey);
  // Tracked in state so the status updates as soon as a key is saved.
  const [savedKey, setSavedKey] = useState(getPublicKey);
  const keyId = useId();
  const enforced = editable ? savedKey.length > 0 : true;
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
      footer={
        editable
          ? "Paste a base64-encoded Ed25519 public key (32 bytes). When a key is set, only content packages signed with it are accepted."
          : "Only content packages signed with this key are accepted. It can’t be changed or removed on this iPad."
      }
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

        {editable ? (
          <>
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
          </>
        ) : (
          <div className="mt-5">
            <LockedSetting label="Public key" setting={setting} />
          </div>
        )}
      </GroupedBody>
    </GroupedSection>
  );
}
