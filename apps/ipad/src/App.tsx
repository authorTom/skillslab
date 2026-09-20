import { useEffect, useState } from "react";
import { openCatalogue, closeCatalogue, isOpen } from "@/data/catalogue";
import { initAssets } from "@/data/assets";
import { useRouter } from "@/hooks/useRouter";
import HomePage from "@/pages/HomePage";
import SkillPage from "@/pages/SkillPage";
import SettingsPage from "@/pages/SettingsPage";

type AppState = "loading" | "empty" | "ready";

export default function App() {
  const [state, setState] = useState<AppState>("loading");
  const { page, params, navigate, back } = useRouter();

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        await initAssets();
        const opened = await openCatalogue();
        if (!cancelled) setState(opened ? "ready" : "empty");
      } catch {
        if (!cancelled) setState("empty");
      }
    }

    init();
    return () => {
      cancelled = true;
      if (isOpen()) closeCatalogue();
    };
  }, []);

  if (state === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-stone-200 border-t-teal-600" />
          <p className="text-sm text-stone-400">Loading content...</p>
        </div>
      </div>
    );
  }

  if (state === "empty") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-stone-50 px-6 text-center">
        <svg className="h-16 w-16 text-stone-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
        </svg>
        <h1 className="mt-6 text-xl font-semibold tracking-tight text-stone-900">
          Welcome to SkillsLab
        </h1>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-stone-500">
          No content package has been loaded yet. Import a content package via the admin
          tools to get started.
        </p>
      </div>
    );
  }

  switch (page) {
    case "skill":
      return <SkillPage slug={params.slug} back={back} />;
    case "settings":
      return <SettingsPage back={back} />;
    default:
      return <HomePage navigate={navigate} />;
  }
}
