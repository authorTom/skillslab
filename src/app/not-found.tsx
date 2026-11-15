import Link from "next/link";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-md rounded-2xl border border-dashed border-stone-300 p-12 text-center">
        <p className="text-sm font-semibold text-teal-700">404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Page not found</h1>
        <p className="mt-3 text-sm leading-relaxed text-stone-500">
          This page doesn&apos;t exist, or the skill it showed has been removed or renamed.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-700"
        >
          <span aria-hidden>←</span> All skills
        </Link>
      </div>
    </main>
  );
}
