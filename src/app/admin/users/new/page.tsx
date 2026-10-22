import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES } from "@/lib/users";
import { NewUserForm } from "@/components/admin/AccountForms";
import { createUserAction } from "../actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "New user",
};

export default async function NewUserPage() {
  await requireRole("admin");

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <Link href="/admin/users" className="text-sm text-stone-500 transition hover:text-stone-900">
        ← Users
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">New user</h1>
      <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
        <NewUserForm
          action={createUserAction}
          roles={ROLES.map((role) => ({
            value: role,
            label: ROLE_LABELS[role],
            description: ROLE_DESCRIPTIONS[role],
          }))}
        />
      </section>
    </main>
  );
}
