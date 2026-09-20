import { useEffect, useState } from "react";
import type { Skill, Resource } from "@/data/types";
import { getSkillBySlug, listResources } from "@/data/catalogue";
import Header from "@/components/Header";
import ResourceViewer from "@/components/ResourceViewer";

interface SkillPageProps {
  slug: string;
  back: () => void;
}

export default function SkillPage({ slug, back }: SkillPageProps) {
  const [skill, setSkill] = useState<Skill | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const s = await getSkillBySlug(slug);
      if (cancelled) return;
      setSkill(s);
      if (s) {
        const r = await listResources(s.id);
        if (!cancelled) setResources(r);
      }
      if (!cancelled) setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50">
        <Header title="Loading..." onBack={back} />
        <div className="flex items-center justify-center p-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-stone-300 border-t-teal-600" />
        </div>
      </div>
    );
  }

  if (!skill) {
    return (
      <div className="min-h-screen bg-stone-50">
        <Header title="Not found" onBack={back} />
        <main className="mx-auto max-w-6xl px-4 py-12 text-center">
          <p className="font-medium text-stone-600">Skill not found</p>
          <p className="mt-1 text-sm text-stone-400">
            This skill may have been removed in a content update.
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <Header title={skill.title} onBack={back} />

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <header className="max-w-3xl">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{skill.title}</h1>
          {skill.description && (
            <p className="mt-2 leading-relaxed text-stone-500">{skill.description}</p>
          )}
        </header>

        <div className="mt-8">
          {resources.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-300 p-12 text-center">
              <p className="font-medium text-stone-600">No resources yet</p>
              <p className="mt-1 text-sm text-stone-400">
                Materials for this skill haven't been added. Check back after a content update.
              </p>
            </div>
          ) : (
            <ResourceViewer resources={resources} />
          )}
        </div>
      </main>
    </div>
  );
}
