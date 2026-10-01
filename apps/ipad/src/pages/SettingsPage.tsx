import { useEffect, useState } from "react";
import { clearPin, isPinSet, PIN_LENGTH, setPin } from "@/data/adminLock";
import { getReleaseInfo, getContentSchemaVersion } from "@/data/catalogue";
import { getPackageState } from "@/data/packages";
import Header from "@/components/Header";
import PageTitle from "@/components/PageTitle";
import BrandMark from "@/components/BrandMark";
import SplitLayout from "@/components/SplitLayout";
import Button from "@/components/Button";
import PinPad from "@/components/PinPad";
import { GroupedBody, GroupedSection, InfoList, InfoRow, NavRow, Notice } from "@/components/Grouped";
import { CheckCircleIcon, LockIcon, RefreshIcon } from "@/components/icons";

interface SettingsPageProps {
  back: () => void;
  navigate: (path: string) => void;
}

interface ContentInfo {
  releaseId: string;
  releaseVersion: string;
  createdAt: string;
  schemaVersion: number;
  hasPrevious: boolean;
}

export default function SettingsPage({ back, navigate }: SettingsPageProps) {
  const [info, setInfo] = useState<ContentInfo | null>(null);

  useEffect(() => {
    async function load() {
      const [release, schema, state] = await Promise.all([
        getReleaseInfo(),
        getContentSchemaVersion(),
        getPackageState(),
      ]);
      if (release) {
        setInfo({
          releaseId: release.id,
          releaseVersion: release.version,
          createdAt: release.createdAt,
          schemaVersion: schema,
          hasPrevious: state.previous !== null,
        });
      }
    }
    load();
  }, []);

  const published = info?.createdAt ? formatDate(info.createdAt) : null;

  return (
    <div className="min-h-screen bg-canvas">
      <Header title="Settings" onBack={back} backLabel="Skills" titleInPortraitOnly />

      <SplitLayout
        intro={
          <>
            <PageTitle eyebrow="SkillsLab Reader" title="Settings">
              <p>Details of the content installed on this iPad, and where to update it.</p>
            </PageTitle>
            <div className="mt-8 flex items-center gap-4 rounded-[1.25rem] bg-surface p-4 shadow-card ring-1 ring-line">
              <BrandMark className="h-14 w-14 shrink-0 drop-shadow-sm" />
              <div className="min-w-0">
                <p className="font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-ink-3">Installed content</p>
                <p className="mt-0.5 font-mono text-[1.0625rem] text-ink">{info ? `v${info.releaseVersion}` : "None"}</p>
                {published && <p className="text-[0.8125rem] text-ink-2">Published {published}</p>}
              </div>
            </div>
          </>
        }
      >
        <GroupedSection
          title="Content package"
          footer={info?.hasPrevious ? "The previously installed version is kept, so you can roll back if needed." : undefined}
        >
          {info ? (
            <InfoList>
              <InfoRow label="Version" value={info.releaseVersion} />
              <InfoRow label="Published" value={published ?? "Unknown"} />
              <InfoRow label="Release ID" value={info.releaseId} mono />
              <InfoRow label="Schema version" value={String(info.schemaVersion)} />
              {info.hasPrevious && <InfoRow label="Rollback" value="Previous version available" />}
            </InfoList>
          ) : (
            <p className="px-4 py-4 text-[0.9375rem] text-ink-2">No content loaded.</p>
          )}
        </GroupedSection>

        <GroupedSection title="Content updates">
          <NavRow
            icon={<RefreshIcon className="h-[18px] w-[18px]" />}
            title="Manage updates"
            subtitle="Check the CMS server or import a package"
            onClick={() => navigate("/update")}
          />
        </GroupedSection>

        <AdminLockSection />

        <GroupedSection title="About">
          <InfoList>
            <InfoRow label="App" value="SkillsLab Reader" />
            <InfoRow label="Platform" value="iPad (iOS)" />
          </InfoList>
        </GroupedSection>
      </SplitLayout>
    </div>
  );
}

type LockStep = "idle" | "choose" | "confirm" | "remove";

/** Set, change or turn off the PIN that guards Settings and updates. */
function AdminLockSection() {
  const [enabled, setEnabled] = useState(isPinSet);
  const [step, setStep] = useState<LockStep>("idle");
  const [first, setFirst] = useState("");
  const [mismatch, setMismatch] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  function start() {
    setDone(null);
    setMismatch(false);
    setStep("choose");
  }

  function cancel() {
    setFirst("");
    setMismatch(false);
    setStep("idle");
  }

  async function confirm(pin: string): Promise<string | null> {
    if (pin !== first) {
      // As on iOS: start again rather than guess which entry was wrong.
      setFirst("");
      setMismatch(true);
      setStep("choose");
      return null;
    }
    try {
      await setPin(pin);
    } catch (err) {
      return err instanceof Error ? err.message : "Couldn’t save the PIN.";
    }
    setFirst("");
    setEnabled(true);
    setStep("idle");
    setDone(enabled ? "PIN changed." : "PIN set. Settings and content updates now need it.");
    return null;
  }

  function turnOff() {
    clearPin();
    setEnabled(false);
    setStep("idle");
    setDone("Admin lock turned off.");
  }

  return (
    <GroupedSection
      title="Admin lock"
      footer="Students can still open every skill. If the PIN is forgotten, the only way back in is to delete and reinstall the app, which removes the installed content."
    >
      <GroupedBody>
        <div className="flex flex-wrap items-center gap-3.5">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              enabled ? "bg-success-soft text-success-ink" : "bg-surface-2 text-ink-3"
            }`}
          >
            <LockIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1" role="status">
            <p className="text-[0.9375rem] font-medium">{enabled ? "On" : "Off"}</p>
            <p className="text-[0.8125rem] text-ink-3">
              {enabled
                ? "Settings and content updates need the PIN"
                : "Anyone can open Settings and content updates"}
            </p>
          </div>
          {step === "idle" &&
            (enabled ? (
              <div className="flex gap-2">
                <Button variant="secondary" onClick={start}>
                  Change PIN
                </Button>
                <Button variant="danger" onClick={() => setStep("remove")}>
                  Turn off
                </Button>
              </div>
            ) : (
              <Button variant="tinted" icon={<LockIcon className="h-4 w-4" />} onClick={start}>
                Set PIN
              </Button>
            ))}
        </div>

        {(step === "choose" || step === "confirm") && (
          <div className="mt-6 flex animate-fade-in flex-col items-center border-t border-line pt-6">
            {step === "choose" ? (
              <PinPad
                key="choose"
                label={`Choose a ${PIN_LENGTH}-digit PIN`}
                hint={mismatch ? "The PINs didn’t match. Choose a PIN again." : undefined}
                onComplete={(pin) => {
                  setFirst(pin);
                  setStep("confirm");
                  return null;
                }}
              />
            ) : (
              <PinPad key="confirm" label="Enter the PIN again" onComplete={confirm} />
            )}
            <Button variant="plain" className="mt-5" onClick={cancel}>
              Cancel
            </Button>
          </div>
        )}

        {step === "remove" && (
          <div className="mt-5 animate-fade-in rounded-xl bg-danger-soft p-4 text-danger-ink" role="group" aria-label="Confirm turning off the admin lock">
            <p className="font-semibold">Turn off the admin lock?</p>
            <p className="mt-0.5 text-[0.9375rem] leading-relaxed">
              Anyone using this iPad will be able to change its settings and content.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="destructive" onClick={turnOff}>
                Turn off
              </Button>
              <Button variant="secondary" onClick={() => setStep("idle")}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {done && step === "idle" && (
          <div className="mt-5">
            <Notice tone="success" icon={<CheckCircleIcon className="h-5 w-5" />} title={done} />
          </div>
        )}
      </GroupedBody>
    </GroupedSection>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
