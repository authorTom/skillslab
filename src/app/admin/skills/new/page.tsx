import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createSkillAction } from "../../actions";
import SkillFields from "@/components/admin/SkillFields";

export const dynamic = "force-dynamic";

export default async function NewSkillPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAdmin();
  const { error } = await searchParams;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Link href="/admin" className="text-sm text-stone-500 transition hover:text-stone-900">
        ← All courses
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">New skill</h1>

      <form
        action={createSkillAction}
        className="mt-8 space-y-5 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8"
      >
        {error === "title" && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            A title is required.
          </p>
        )}
        <SkillFields />
        <button className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700">
          Create skill
        </button>
      </form>
    </main>
  );
}
