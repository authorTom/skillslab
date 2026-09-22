import { useEffect, useState } from "react";
import type { Skill, Resource } from "@/data/types";
import { getCategory, getSkillBySlug, listResources } from "@/data/catalogue";
import Header from "@/components/Header";
import PageTitle from "@/components/PageTitle";
import ResourceViewer from "@/components/ResourceViewer";
import EmptyState from "@/components/EmptyState";
import Button from "@/components/Button";
import Spinner from "@/components/Spinner";
import { ChevronLeftIcon, SearchIcon } from "@/components/icons";

interface SkillPageProps {
  slug: string;
  back: () => void;
}

export default function SkillPage({ slug, back }: SkillPageProps) {
  const [skill, setSkill] = useState<Skill | null>(null);
  const [categoryName, setCategoryName] = useState<string | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const s = await getSkillBySlug(slug);
      if (cancelled) return;
      setSkill(s);
      if (s) {
        const [r, c] = await Promise.all([
          listResources(s.id),
          s.category_id !== null ? getCategory(s.category_id) : null,
        ]);
        if (!cancelled) {
          setResources(r);
          setCategoryName(c?.name ?? null);
        }
      }
      if (!cancelled) setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-canvas">
        <Header onBack={back} backLabel="Skills" />
        <div className="flex items-center justify-center p-24 text-ink-3" role="status">
          <Spinner className="h-7 w-7" />
          <span className="sr-only">Loading skill</span>
        </div>
      </div>
    );
  }

  if (!skill) {
    return (
      <div className="min-h-screen bg-canvas">
        <Header onBack={back} backLabel="Skills" />
        <main className="mx-auto max-w-6xl px-5 pt-16 sm:px-8">
          <h1 className="sr-only">Skill not found</h1>
          <EmptyState
            icon={<SearchIcon className="h-7 w-7" />}
            title="Skill not found"
            action={<Button variant="secondary" onClick={back}>Back to skills</Button>}
          >
            This skill may have been removed in a content update.
          </EmptyState>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas">
      {/* Landscape has its own back button in the sticky title column. */}
      <Header title={skill.title} onBack={back} backLabel="Skills" className="lg:hidden" />

      <ResourceViewer
        resources={resources}
        intro={
          <div className="animate-rise">
            <button
              type="button"
              onClick={back}
              className="-ml-2 mb-8 hidden min-h-11 items-center gap-0.5 rounded-lg pr-3 text-[1.0625rem] text-accent-ink transition-opacity active:opacity-50 lg:inline-flex"
            >
              <ChevronLeftIcon className="h-6 w-6" />
              Skills
            </button>
            <PageTitle eyebrow={categoryName} title={skill.title}>
              {skill.description && <p>{skill.description}</p>}
            </PageTitle>
          </div>
        }
      />
    </div>
  );
}
