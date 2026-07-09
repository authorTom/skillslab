import Link from "next/link";
import { notFound } from "next/navigation";
import { getSkillBySlug, listResources } from "@/lib/data";
import ResourceViewer from "@/components/ResourceViewer";

export const dynamic = "force-dynamic";

export default async function SkillPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const skill = getSkillBySlug(slug);
  if (!skill) notFound();
  const resources = listResources(skill.id);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-stone-500 transition hover:text-stone-900"
      >
        <span aria-hidden>←</span> All skills
      </Link>

      <header className="mt-4 max-w-3xl">
        {skill.category && (
          <span className="mb-3 inline-block rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-medium text-teal-700">
            {skill.category}
          </span>
        )}
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{skill.title}</h1>
        {skill.description && (
          <p className="mt-3 leading-relaxed text-stone-500">{skill.description}</p>
        )}
      </header>

      <div className="mt-10">
        {resources.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 p-12 text-center">
            <p className="font-medium text-stone-600">No resources yet</p>
            <p className="mt-1 text-sm text-stone-400">
              Materials for this skill haven&apos;t been added. Check back soon.
            </p>
          </div>
        ) : (
          <ResourceViewer resources={resources} />
        )}
      </div>
    </main>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const skill = getSkillBySlug(slug);
  return { title: skill?.title ?? "Skill not found" };
}
