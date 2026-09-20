import { useEffect, useState, useCallback } from "react";
import { openCatalogue, closeCatalogue, isOpen } from "@/data/catalogue";
import { initAssets } from "@/data/assets";
import { useRouter } from "@/hooks/useRouter";
import HomePage from "@/pages/HomePage";
import SkillPage from "@/pages/SkillPage";
import SettingsPage from "@/pages/SettingsPage";
import UpdatePage from "@/pages/UpdatePage";

type AppState = "loading" | "empty" | "ready";

export default function App() {
  const [state, setState] = useState<AppState>("loading");
  const [contentKey, setContentKey] = useState(0);
  const { page, params, navigate, back } = useRouter();

  const loadContent = useCallback(async () => {
    setState("loading");
    try {
      await initAssets();
      const opened = await openCatalogue();
      setState(opened ? "ready" : "empty");
    } catch {
      setState("empty");
    }
  }, []);

  useEffect(() => {
    loadContent();
    return () => {
      if (isOpen()) closeCatalogue();
    };
  }, [loadContent]);

  const handleContentChanged = useCallback(() => {
    setContentKey((k) => k + 1);
    loadContent();
  }, [loadContent]);

  if (page === "update") {
    return <UpdatePage back={back} onContentChanged={handleContentChanged} />;
  }

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
          No content package has been loaded yet. Import a content package to get started.
        </p>
        <button
          onClick={() => navigate("/update")}
          className="mt-6 rounded-lg bg-teal-600 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-teal-700"
        >
          Import content
        </button>
      </div>
    );
  }

  switch (page) {
    case "skill":
      return <SkillPage key={contentKey} slug={params.slug} back={back} />;
    case "settings":
      return <SettingsPage back={back} navigate={navigate} />;
    default:
      return <HomePage key={contentKey} navigate={navigate} />;
  }
}
