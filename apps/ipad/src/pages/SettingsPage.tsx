import { useEffect, useState } from "react";
import { getReleaseInfo, getContentSchemaVersion } from "@/data/catalogue";
import { getPackageState } from "@/data/packages";
import Header from "@/components/Header";

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

  return (
    <div className="min-h-screen bg-stone-50">
      <Header title="Settings" onBack={back} />

      <main className="mx-auto max-w-2xl px-4 py-8">
        <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          <div className="border-b border-stone-200 px-5 py-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-stone-400">
              Content Package
            </h2>
          </div>

          {info ? (
            <dl className="divide-y divide-stone-100">
              <InfoRow label="Version" value={info.releaseVersion} />
              <InfoRow label="Release ID" value={info.releaseId} mono />
              <InfoRow
                label="Published"
                value={info.createdAt ? formatDate(info.createdAt) : "Unknown"}
              />
              <InfoRow label="Schema version" value={String(info.schemaVersion)} />
              {info.hasPrevious && (
                <InfoRow label="Rollback" value="Previous version available" />
              )}
            </dl>
          ) : (
            <p className="px-5 py-6 text-sm text-stone-500">No content loaded.</p>
          )}
        </section>

        <section className="mt-6 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          <div className="border-b border-stone-200 px-5 py-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-stone-400">
              Content Updates
            </h2>
          </div>
          <div className="px-5 py-4">
            <p className="text-sm text-stone-500">
              Check for new content from the CMS server, or import a content package manually.
            </p>
            <button
              onClick={() => navigate("/update")}
              className="mt-3 rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-teal-700"
            >
              Manage updates
            </button>
          </div>
        </section>

        <section className="mt-6 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          <div className="border-b border-stone-200 px-5 py-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-stone-400">
              About
            </h2>
          </div>
          <dl className="divide-y divide-stone-100">
            <InfoRow label="App" value="SkillsLab Reader" />
            <InfoRow label="Platform" value="iPad (iOS)" />
          </dl>
        </section>
      </main>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-5 py-3">
      <dt className="text-sm text-stone-500">{label}</dt>
      <dd className={`text-right text-sm font-medium text-stone-900 ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </dd>
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
