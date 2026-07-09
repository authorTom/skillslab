import type { Metadata } from "next";
import Link from "next/link";
import { isAdmin } from "@/lib/auth";
import { logoutAction } from "./actions";

export const metadata: Metadata = {
  title: "Admin",
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const authed = await isAdmin();

  return (
    <div>
      <div className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex h-11 max-w-6xl items-center justify-between px-4 text-sm sm:px-6">
          <div className="flex items-center gap-2 text-stone-500">
            <Link href="/admin" className="font-medium text-stone-900 hover:text-teal-700">
              Course administration
            </Link>
          </div>
          {authed && (
            <form action={logoutAction}>
              <button className="text-stone-500 transition hover:text-stone-900">Sign out</button>
            </form>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}
