import Link from "next/link";
import { listCategories, listSkills } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const { q = "", category = "" } = await searchParams;
  const skills = listSkills(q || undefined, category || undefined);
  const categories = listCategories();

  const filterHref = (cat: string) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (cat) params.set("category", cat);
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
          {category && <input type="hidden" name="category" value={category} />}
        </div>
      </form>

      {categories.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href={filterHref("")}
            className={`rounded-full px-3.5 py-1.5 text-sm transition ${
              !category
                ? "bg-stone-900 text-white"
                : "bg-white text-stone-600 ring-1 ring-stone-200 hover:ring-stone-300"
            }`}
          >
            All
          </Link>
          {categories.map((cat) => (
            <Link
              key={cat}
              href={filterHref(cat === category ? "" : cat)}
              className={`rounded-full px-3.5 py-1.5 text-sm transition ${
                cat === category
                  ? "bg-stone-900 text-white"
                  : "bg-white text-stone-600 ring-1 ring-stone-200 hover:ring-stone-300"
              }`}
            >
              {cat}
            </Link>
          ))}
        </div>
      )}

      {skills.length === 0 ? (
        <div className="mt-16 rounded-2xl border border-dashed border-stone-300 p-12 text-center">
          <p className="font-medium text-stone-600">No skills found</p>
          <p className="mt-1 text-sm text-stone-400">
            {q || category ? "Try a different search or filter." : "Add skills via the admin section."}
          </p>
        </div>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {skills.map((skill) => (
            <li key={skill.id}>
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
                  {skill.category && (
                    <span className="mb-3 w-fit rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-medium text-teal-700">
                      {skill.category}
                    </span>
                  )}
                  <h2 className="text-lg font-semibold tracking-tight group-hover:text-teal-700">
                    {skill.title}
                  </h2>
                  <p className="mt-2 line-clamp-3 flex-1 text-sm leading-relaxed text-stone-500">
                    {skill.description}
                  </p>
                  <p className="mt-4 text-xs font-medium text-stone-400">
                    {skill.resource_count === 1
                      ? "1 resource"
                      : `${skill.resource_count} resources`}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
