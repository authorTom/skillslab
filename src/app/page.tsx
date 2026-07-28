import Link from "next/link";
import { groupSkills, listCategories, listGroups, listSkills, type SkillWithCount } from "@/lib/data";

export const dynamic = "force-dynamic";

function chipClass(active: boolean): string {
  return `rounded-full px-3.5 py-1.5 text-sm transition ${
    active
      ? "bg-stone-900 text-white"
      : "bg-white text-stone-600 ring-1 ring-stone-200 hover:ring-stone-300"
  }`;
}

function SkillCard({ skill, showCategory }: { skill: SkillWithCount; showCategory: boolean }) {
  return (
    <li>
      <Link
        href={`/skills/${skill.slug}`}
        className="group flex h-full flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md"
      >
        {skill.thumbnail && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={skill.thumbnail}
            alt=""
            className="aspect-video w-full border-b border-stone-100 object-cover"
          />
        )}
        <div className="flex flex-1 flex-col p-6">
          {showCategory && skill.category_name && (
            <span className="mb-3 w-fit rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-medium text-teal-700">
              {skill.category_name}
            </span>
          )}
          <h2 className="text-lg font-semibold tracking-tight group-hover:text-teal-700">
            {skill.title}
          </h2>
          <p className="mt-2 line-clamp-3 flex-1 text-sm leading-relaxed text-stone-500">
            {skill.description}
          </p>
          <p className="mt-4 text-xs font-medium text-stone-400">
            {skill.resource_count === 1 ? "1 resource" : `${skill.resource_count} resources`}
          </p>
        </div>
      </Link>
    </li>
  );
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; group?: string }>;
}) {
  const { q = "", category = "", group = "" } = await searchParams;
  const skills = listSkills({ q, category, group });
  const groups = listGroups();
  const allCategories = listCategories();

  // A chosen group narrows the category chips; otherwise every category shows.
  const categories = group ? allCategories.filter((c) => c.group_slug === group) : allCategories;
  const sections = groupSkills(skills);
  const searching = Boolean(q);

  const href = (next: { q?: string; group?: string; category?: string }) => {
    const params = new URLSearchParams();
    if (next.q) params.set("q", next.q);
    if (next.group) params.set("group", next.group);
    if (next.category) params.set("category", next.category);
    const query = params.toString();
    return query ? `/?${query}` : "/";
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Clinical skills library
        </h1>
        <p className="mt-3 text-stone-500">
          Select a skill to review its videos, storyboards, guides and images — before, during or
          after your clinical skills lab.
        </p>
      </div>

      <form action="/" className="mt-8">
        <div className="relative max-w-md">
          <svg
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search skills…"
            className="w-full rounded-xl border border-stone-200 bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm outline-none transition placeholder:text-stone-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
          />
          {group && <input type="hidden" name="group" value={group} />}
          {category && <input type="hidden" name="category" value={category} />}
        </div>
      </form>

      {groups.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-stone-400">
            Group
          </span>
          <Link href={href({ q })} className={chipClass(!group && !category)}>
            All
          </Link>
          {groups.map((g) => (
            <Link
              key={g.id}
              href={href({ q, group: g.slug === group ? "" : g.slug })}
              className={chipClass(g.slug === group)}
              title={g.description || undefined}
            >
              {g.name}
            </Link>
          ))}
        </div>
      )}

      {categories.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-stone-400">
            Category
          </span>
          {categories.map((c) => (
            <Link
              key={c.id}
              href={href({ q, group, category: c.slug === category ? "" : c.slug })}
              className={chipClass(c.slug === category)}
            >
              {c.name}
              <span className={c.slug === category ? "text-stone-300" : "text-stone-400"}>
                {" "}
                {c.skill_count}
              </span>
            </Link>
          ))}
        </div>
      )}

      {skills.length === 0 ? (
        <div className="mt-16 rounded-2xl border border-dashed border-stone-300 p-12 text-center">
          <p className="font-medium text-stone-600">No skills found</p>
          <p className="mt-1 text-sm text-stone-400">
            {q || category || group
              ? "Try a different search or filter."
              : "Add skills via the admin section."}
          </p>
        </div>
      ) : searching ? (
        <>
          <p className="mt-8 text-sm text-stone-400">
            {skills.length === 1 ? "1 skill matches" : `${skills.length} skills match`} “{q}”
          </p>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {skills.map((skill) => (
              <SkillCard key={skill.id} skill={skill} showCategory />
            ))}
          </ul>
        </>
      ) : (
        <div className="mt-10 space-y-12">
          {sections.map((section) => (
            <section key={section.key}>
              {section.name && (
                <div className="border-b border-stone-200 pb-3">
                  <h2 className="text-xl font-semibold tracking-tight">
                    {section.slug ? (
                      <Link href={href({ group: section.slug })} className="hover:text-teal-700">
                        {section.name}
                      </Link>
                    ) : (
                      section.name
                    )}
                  </h2>
                  {section.description && (
                    <p className="mt-1 text-sm text-stone-500">{section.description}</p>
                  )}
                </div>
              )}
              <div className={section.name ? "mt-6 space-y-8" : "space-y-8"}>
                {section.categories.map((c) => (
                  <div key={c.key}>
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-stone-400">
                      {c.slug ? (
                        <Link href={href({ category: c.slug })} className="hover:text-stone-600">
                          {c.name}
                        </Link>
                      ) : (
                        c.name
                      )}
                    </h3>
                    <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {c.skills.map((skill) => (
                        <SkillCard key={skill.id} skill={skill} showCategory={false} />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
