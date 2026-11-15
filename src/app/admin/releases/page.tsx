import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { listReleases } from "@/lib/offline/releases";
import { releaseSignature, signingStatus, type SigningStatus } from "@/lib/offline/release-signing";
import ConfirmButton from "@/components/admin/ConfirmButton";
import BuildReleaseForm from "./BuildReleaseForm";
import PublicKeyField from "./PublicKeyField";
import { buildReleaseAction, deleteReleaseAction, markCurrentAction } from "./actions";

export const dynamic = "force-dynamic";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default async function ReleasesPage() {
  await requireRole("admin");
  const releases = listReleases();
  const signing = signingStatus();

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Offline releases</h1>
          <p className="mt-1 text-sm text-stone-500">
            Build content packages for the iPad reader app.
          </p>
        </div>
        <Link
          href="/admin"
          className="text-sm text-stone-500 transition hover:text-stone-900"
        >
          ← Back to courses
        </Link>
      </div>

      <SigningPanel status={signing} />

      <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
        <h2 className="text-base font-semibold">Build a new release</h2>
        <p className="mt-1 text-sm text-stone-500">
          Exports all skills, resources, and media into an offline content package. The new release
          is automatically marked as current.
        </p>
        <div className="mt-4">
          <BuildReleaseForm action={buildReleaseAction} />
        </div>
      </section>

      {releases.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-400">
            Previous releases
          </h2>
          <p className="mt-1 text-sm text-stone-500">
            To set up iPads without a network, download a package, copy it to a USB drive or AirDrop
            it to each iPad, then choose <span className="font-medium">Install from a file</span> in
            the app&rsquo;s Content updates.
          </p>
          <div className="mt-3 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
            <ul className="divide-y divide-stone-200">
              {releases.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-medium">
                      v{r.version}
                      {r.current && (
                        <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-semibold text-teal-800">
                          Current
                        </span>
                      )}
                      <SignatureBadge state={releaseSignature(r.manifest, signing)} />
                    </p>
                    <p className="mt-0.5 text-xs text-stone-400">
                      {formatDate(r.createdAt)} · {r.counts.skills} skills ·{" "}
                      {r.counts.resources} resources · {formatBytes(r.totalBytes)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <a
                      href={`/api/offline/releases/${encodeURIComponent(r.id)}/package`}
                      download
                      className="rounded-lg border border-stone-200 px-3 py-1.5 font-medium text-stone-700 transition hover:border-teal-300"
                    >
                      Download package
                    </a>
                    {!r.current && (
                      <form action={markCurrentAction}>
                        <input type="hidden" name="id" value={r.id} />
                        <button
                          className="rounded-lg border border-stone-200 px-3 py-1.5 font-medium text-stone-700 transition hover:border-teal-300"
                        >
                          Set current
                        </button>
                      </form>
                    )}
                    <form action={deleteReleaseAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <ConfirmButton
                        message={`Permanently delete release v${r.version}?`}
                        className="rounded-lg px-3 py-1.5 text-red-600 transition hover:bg-red-50"
                      >
                        Delete
                      </ConfirmButton>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </main>
  );
}

function SigningPanel({ status }: { status: SigningStatus }) {
  if (status.state === "ready") {
    return (
      <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
        <h2 className="text-base font-semibold">Release signing</h2>
        <p className="mt-1 text-sm text-stone-500">
          On. Every release is signed as it&rsquo;s built, and iPads configured with this public key
          refuse any package it didn&rsquo;t sign.
        </p>
        <PublicKeyField publicKey={status.publicKey} />
        <p className="mt-2 text-xs text-stone-400">
          Use it as <code className="font-mono">signingPublicKey</code> in the iPads&rsquo; managed
          configuration, or <code className="font-mono">VITE_SIGNING_PUBLIC_KEY</code> when building
          the app.
        </p>
      </section>
    );
  }
  if (status.state === "error") {
    return (
      <section className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-900 sm:p-8">
        <h2 className="text-base font-semibold">Release signing isn&rsquo;t working</h2>
        <p className="mt-1">{status.message}</p>
        <p className="mt-2 text-red-800">
          Releases can&rsquo;t be built until this is fixed, or{" "}
          <code className="font-mono">RELEASE_SIGNING_KEY_FILE</code> is unset.
        </p>
      </section>
    );
  }
  return (
    <section className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900 sm:p-8">
      <h2 className="text-base font-semibold">Release signing is off</h2>
      <p className="mt-1">
        Releases are built unsigned. Production builds of the iPad app refuse unsigned packages. To
        sign, point <code className="font-mono">RELEASE_SIGNING_KEY_FILE</code> at an Ed25519 private
        key; the README explains how.
      </p>
    </section>
  );
}

function SignatureBadge({ state }: { state: ReturnType<typeof releaseSignature> }) {
  if (state === "signed") {
    return (
      <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600">
        Signed
      </span>
    );
  }
  if (state === "other-key") {
    return (
      <span
        className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
        title="Signed with a key other than the one configured now. iPads with the current key will refuse it."
      >
        Signed with another key
      </span>
    );
  }
  return (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
      Unsigned
    </span>
  );
}
