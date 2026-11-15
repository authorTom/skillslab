"use client"; // Error boundaries must be Client Components

import Link from "next/link";

export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  // In production a server error's message is generic; the digest matches the
  // full error in the server log.
  const digest = error instanceof Error && "digest" in error ? String(error.digest) : null;

  return (
    <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-md rounded-2xl border border-dashed border-stone-300 p-12 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="mt-3 text-sm leading-relaxed text-stone-500">
          This page couldn&apos;t be shown. Trying again often works; if it keeps happening, let
          whoever runs SkillsLab know.
        </p>
        {digest && (
          <p className="mt-3 font-mono text-xs text-stone-400">Reference: {digest}</p>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            onClick={() => retry()}
            className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-700"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-xl border border-stone-200 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-teal-300"
          >
            All skills
          </Link>
        </div>
      </div>
    </main>
  );
}
