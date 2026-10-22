import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { ChangePasswordForm } from "@/components/admin/AccountForms";
import { changePasswordAction } from "../../actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Choose a password",
};

/** Where an account with a temporary password is held until it chooses its own. */
export default async function ChoosePasswordPage() {
  const user = await requireUser({ allowPasswordChange: true });
  if (!user.must_change_password) redirect("/admin/account");

  return (
    <main className="mx-auto flex max-w-6xl justify-center px-4 py-16 sm:px-6">
      <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">Choose your password</h1>
        <p className="mt-1 mb-6 text-sm text-stone-500">
          Welcome, {user.name}. You signed in with a temporary password — choose your own to
          continue. Only you will know it.
        </p>
        <ChangePasswordForm action={changePasswordAction} currentLabel="Temporary password" />
      </div>
    </main>
  );
}
