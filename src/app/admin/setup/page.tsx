import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ensureAdminAccess } from "@/lib/bootstrap";
import { SetupForm } from "@/components/admin/AccountForms";
import { setupAction } from "../actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Set up",
};

export default async function SetupPage() {
  if ((await ensureAdminAccess()) === "ready") redirect("/admin/login");

  return (
    <main className="mx-auto flex max-w-6xl justify-center px-4 py-16 sm:px-6">
      <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">Create the first administrator</h1>
        <p className="mt-1 text-sm text-stone-500">
          SkillsLab has no administrator yet. Enter the one-time setup code from the server log —{" "}
          <code className="rounded bg-stone-100 px-1 text-xs">docker compose logs app</code>, or
          the terminal running the server — then choose your account details.
        </p>
        <SetupForm action={setupAction} />
      </div>
    </main>
  );
}
