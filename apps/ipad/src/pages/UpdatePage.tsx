import { useState, useEffect } from "react";
import Header from "@/components/Header";
import { useUpdater } from "@/hooks/useUpdater";
import { getServerUrl, setServerUrl } from "@/data/settings";
import { getPackageState } from "@/data/packages";

interface UpdatePageProps {
  back: () => void;
  onContentChanged: () => void;
}

export default function UpdatePage({ back, onContentChanged }: UpdatePageProps) {
  const { state, check, download, scanImports, importDir, rollback, reset } =
    useUpdater(onContentChanged);
  const [url, setUrl] = useState(getServerUrl);
  const [canRollback, setCanRollback] = useState(false);

  useEffect(() => {
    getPackageState().then((s) => setCanRollback(s.previous !== null));
  }, [state.status]);

  function handleSaveUrl() {
    setServerUrl(url);
  }

  const busy =
    state.status === "checking" ||
    state.status === "downloading" ||
    state.status === "activating" ||
    state.status === "importing" ||
    state.status === "scanning" ||
    state.status === "rolling-back";

  return (
    <div className="min-h-screen bg-stone-50">
      <Header title="Content Updates" onBack={back} />

      <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
        {/* Server URL */}
        <Section title="Server">
          <label className="block text-sm text-stone-500">
            CMS server URL
          </label>
          <div className="mt-2 flex gap-2">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://skills.example.nhs.uk"
              className="flex-1 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            />
            <button
              onClick={handleSaveUrl}
              className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-800"
            >
              Save
            </button>
          </div>
        </Section>

        {/* Online update */}
        <Section title="Online Update">
          <div className="flex flex-wrap gap-3">
            <button
              onClick={check}
              disabled={busy || !url}
              className="rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-teal-700 disabled:opacity-50"
            >
              {state.status === "checking" ? "Checking..." : "Check for updates"}
            </button>
          </div>

          {state.status === "available" && state.manifest && (
            <div className="mt-4 rounded-xl border border-teal-200 bg-teal-50 p-4">
              <p className="font-medium text-teal-800">
                Update available: v{state.manifest.release_version}
              </p>
              <p className="mt-1 text-sm text-teal-700">
                {state.manifest.counts.skills} skills, {state.manifest.counts.resources} resources,{" "}
                {state.manifest.counts.assets} assets
                ({formatBytes(state.manifest.total_uncompressed_bytes)})
              </p>
              <button
                onClick={download}
                className="mt-3 rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-teal-700"
              >
                Download and install
              </button>
            </div>
          )}

          {(state.status === "downloading" || state.status === "activating") && state.progress && (
            <ProgressBar progress={state.progress} activating={state.status === "activating"} />
          )}

          {state.status === "done" && (
            <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4">
              <p className="font-medium text-green-800">
                Content updated successfully.
              </p>
              <button
                onClick={() => { reset(); back(); }}
                className="mt-3 rounded-lg bg-green-700 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-green-800"
              >
                Done
              </button>
            </div>
          )}
        </Section>

        {/* Manual import */}
        <Section title="Manual Import">
          <p className="text-sm text-stone-500">
            Place a content package directory inside the app's <strong>import</strong> folder
            using the Files app, then scan below.
          </p>
          <button
            onClick={scanImports}
            disabled={busy}
            className="mt-3 rounded-lg border border-stone-200 bg-white px-5 py-2.5 text-sm font-medium text-stone-700 transition hover:border-teal-300 disabled:opacity-50"
          >
            {state.status === "scanning" ? "Scanning..." : "Scan for packages"}
          </button>

          {state.importDirs.length > 0 && (
            <ul className="mt-4 divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white">
              {state.importDirs.map((dir) => (
                <li key={dir} className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm font-medium text-stone-700">
                    {dir.replace("import/", "")}
                  </span>
                  <button
                    onClick={() => importDir(dir)}
                    disabled={busy}
                    className="rounded-lg bg-teal-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-teal-700 disabled:opacity-50"
                  >
                    {state.status === "importing" ? "Importing..." : "Import"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* Rollback */}
        {canRollback && (
          <Section title="Rollback">
            <p className="text-sm text-stone-500">
              Revert to the previously installed content package.
            </p>
            <button
              onClick={rollback}
              disabled={busy}
              className="mt-3 rounded-lg border border-red-200 bg-white px-5 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
            >
              {state.status === "rolling-back" ? "Rolling back..." : "Roll back"}
            </button>
          </Section>
        )}

        {/* Error display */}
        {state.error && state.status !== "done" && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm text-amber-800">{state.error}</p>
          </div>
        )}
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="border-b border-stone-200 px-5 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-stone-400">{title}</h2>
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

function ProgressBar({
  progress,
  activating,
}: {
  progress: { filesTotal: number; filesDone: number; bytesTotal: number; bytesDownloaded: number };
  activating: boolean;
}) {
  const pct = progress.bytesTotal > 0
    ? Math.round((progress.bytesDownloaded / progress.bytesTotal) * 100)
    : 0;

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between text-sm">
        <span className="text-stone-600">
          {activating
            ? "Activating content..."
            : `Downloading file ${progress.filesDone} of ${progress.filesTotal}`}
        </span>
        <span className="tabular-nums text-stone-400">{pct}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-200">
        <div
          className="h-full rounded-full bg-teal-600 transition-all duration-300"
          style={{ width: `${activating ? 100 : pct}%` }}
        />
      </div>
      {!activating && progress.bytesTotal > 0 && (
        <p className="mt-1 text-xs text-stone-400">
          {formatBytes(progress.bytesDownloaded)} / {formatBytes(progress.bytesTotal)}
        </p>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
