import { useEffect, useState, useCallback } from "react";
import { openCatalogue, closeCatalogue, isOpen } from "@/data/catalogue";
import { initAssets } from "@/data/assets";
import { useRouter } from "@/hooks/useRouter";
import HomePage from "@/pages/HomePage";
import SkillPage from "@/pages/SkillPage";
import SettingsPage from "@/pages/SettingsPage";
import UpdatePage from "@/pages/UpdatePage";
import BrandMark from "@/components/BrandMark";
import Button from "@/components/Button";
import Spinner from "@/components/Spinner";
import { DownloadIcon } from "@/components/icons";

type AppState = "loading" | "empty" | "ready";

async function openContent(): Promise<AppState> {
  try {
    await initAssets();
    return (await openCatalogue()) ? "ready" : "empty";
  } catch {
    return "empty";
  }
}

export default function App() {
  const [state, setState] = useState<AppState>("loading");
  const [contentKey, setContentKey] = useState(0);
  const { page, params, navigate, back } = useRouter();

  useEffect(() => {
    let cancelled = false;
    openContent().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
      if (isOpen()) closeCatalogue();
    };
  }, []);

  const handleContentChanged = useCallback(async () => {
    setContentKey((k) => k + 1);
    setState("loading");
    setState(await openContent());
  }, []);

  if (page === "update") {
    return <UpdatePage back={back} onContentChanged={handleContentChanged} />;
  }

  if (state === "loading") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-canvas" role="status">
        <BrandMark className="h-16 w-16 drop-shadow-sm" />
        <div className="flex items-center gap-2.5 text-ink-2">
          <Spinner className="h-4 w-4" />
          <span className="text-[0.9375rem]">Loading content…</span>
        </div>
      </div>
    );
  }

  if (state === "empty") {
    return (
      <main className="safe-top safe-bottom flex min-h-screen flex-col items-center justify-center bg-canvas px-6 text-center">
        <BrandMark className="h-20 w-20 drop-shadow-md" />
        <h1 className="mt-8 text-[2rem] font-bold leading-tight tracking-[-0.025em]">Welcome to SkillsLab</h1>
        <p className="mt-3 max-w-md text-[1.0625rem] leading-relaxed text-ink-2 text-pretty">
          Clinical skills videos, storyboards and guides, available offline. Install a content package to get
          started.
        </p>
        <Button size="lg" className="mt-8" icon={<DownloadIcon className="h-5 w-5" />} onClick={() => navigate("/update")}>
          Get content
        </Button>
        <p className="mt-4 max-w-xs text-[0.8125rem] leading-relaxed text-ink-3">
          Download it from your CMS server, or import a package copied onto this iPad.
        </p>
      </main>
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
