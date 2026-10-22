import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { logoutAction } from "./actions";

export const metadata: Metadata = {
  title: "Admin",
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  // An account holding a temporary password can only choose a new one or sign out.
  const fullAccess = user && !user.must_change_password;

  return (
    <div>
      <div className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex h-11 max-w-6xl items-center justify-between gap-4 px-4 text-sm sm:px-6">
          <div className="flex items-center gap-2 text-stone-500">
            <Link href="/admin" className="font-medium text-stone-900 hover:text-teal-700">
              Course administration
            </Link>
          </div>
          {user && (
            <div className="flex min-w-0 items-center gap-4 text-stone-500">
              {fullAccess && user.role === "admin" && (
                <Link href="/admin/users" className="transition hover:text-stone-900">
                  Users
                </Link>
              )}
              {fullAccess && (
                <Link
                  href="/admin/account"
                  className="truncate transition hover:text-stone-900"
                  title={`Signed in as ${user.username}`}
                >
                  {user.name}
                </Link>
              )}
              <form action={logoutAction}>
                <button className="transition hover:text-stone-900">Sign out</button>
              </form>
            </div>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}
