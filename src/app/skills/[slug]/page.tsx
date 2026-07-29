import Link from "next/link";
import { notFound } from "next/navigation";
import { getSkillBySlug } from "@/lib/data";
import { listResolvedResources } from "@/lib/media";
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
  const resources = listResolvedResources(skill.id);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-stone-500 transition hover:text-stone-900"
      >
        <span aria-hidden>←</span> All skills
      </Link>

      <header className="mt-4 max-w-3xl">
        {skill.category_slug && (
          <p className="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
            {skill.group_slug && (
              <>
                <Link
                  href={`/?group=${skill.group_slug}`}
                  className="rounded-full bg-stone-100 px-2.5 py-0.5 font-medium text-stone-600 transition hover:bg-stone-200"
                >
                  {skill.group_name}
                </Link>
                <span aria-hidden className="text-stone-300">
                  ›
                </span>
              </>
            )}
            <Link
              href={`/?category=${skill.category_slug}`}
              className="rounded-full bg-teal-50 px-2.5 py-0.5 font-medium text-teal-700 transition hover:bg-teal-100"
            >
              {skill.category_name}
            </Link>
          </p>
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
