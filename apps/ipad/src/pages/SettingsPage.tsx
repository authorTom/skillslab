import { useEffect, useState } from "react";
import { getReleaseInfo, getContentSchemaVersion } from "@/data/catalogue";
import { getPackageState } from "@/data/packages";
import Header from "@/components/Header";
import PageTitle from "@/components/PageTitle";
import BrandMark from "@/components/BrandMark";
import SplitLayout from "@/components/SplitLayout";
import { GroupedSection, InfoList, InfoRow, NavRow } from "@/components/Grouped";
import { RefreshIcon } from "@/components/icons";

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
