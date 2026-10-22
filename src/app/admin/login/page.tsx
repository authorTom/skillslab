import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { ensureAdminAccess } from "@/lib/bootstrap";
import { LoginForm } from "@/components/admin/AccountForms";
import { loginAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if ((await ensureAdminAccess()) === "setup") redirect("/admin/setup");
  if (await getCurrentUser()) redirect("/admin");

  return (
    <main className="mx-auto flex max-w-6xl justify-center px-4 py-20 sm:px-6">
      <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">Admin sign in</h1>
        <p className="mt-1 text-sm text-stone-500">
          Sign in to manage courses. Forgotten your password? Ask an administrator to reset it.
        </p>
        <LoginForm action={loginAction} />
      </div>
    </main>
  );
}
