import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Clinical Skills",
    template: "%s · Clinical Skills",
  },
  description:
    "Educational resources for procedural clinical skills: videos, storyboards, guides and images.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} flex min-h-screen flex-col font-sans`}
      >
        <header className="sticky top-0 z-40 border-b border-stone-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
            <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-600 text-sm font-bold text-white">
                +
              </span>
              Clinical Skills
            </Link>
            <nav className="flex items-center gap-6 text-sm">
              <Link href="/" className="text-stone-600 transition-colors hover:text-stone-900">
                Skills
              </Link>
              <Link href="/admin" className="text-stone-400 transition-colors hover:text-stone-900">
                Admin
              </Link>
            </nav>
          </div>
        </header>
        <div className="flex-1">{children}</div>
        <footer className="border-t border-stone-200 py-6">
          <p className="mx-auto max-w-6xl px-4 text-xs text-stone-400 sm:px-6">
            Clinical Skills — educational resource library
          </p>
        </footer>
      </body>
    </html>
  );
}
