import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createSkillAction } from "../../actions";
import SkillForm from "@/components/admin/SkillForm";

export const dynamic = "force-dynamic";

export default async function NewSkillPage() {
  await requireAdmin();

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Link href="/admin" className="text-sm text-stone-500 transition hover:text-stone-900">
        ← All courses
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">New skill</h1>

      <div className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
        <SkillForm
          action={createSkillAction}
          submitLabel="Create skill"
          pendingLabel="Creating…"
        />
      </div>
    </main>
  );
}
