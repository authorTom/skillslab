import { useEffect, useState, useMemo } from "react";
import type { Group, Category, Skill } from "@/data/types";
import { listGroups, listCategories, listSkills, searchSkills } from "@/data/catalogue";
import { assetUrl } from "@/data/assets";
import Header from "@/components/Header";
import SearchBar from "@/components/SearchBar";

interface HomePageProps {
  navigate: (path: string) => void;
}

export default function HomePage({ navigate }: HomePageProps) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Skill[] | null>(null);
  const [activeGroup, setActiveGroup] = useState<number | null>(null);
  const [activeCategory, setActiveCategory] = useState<number | null>(null);

  useEffect(() => {
    async function load() {
      const [g, c, s] = await Promise.all([listGroups(), listCategories(), listSkills()]);
      setGroups(g);
      setCategories(c);
      setSkills(s);
    }
    load();
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }
    let cancelled = false;
    const timeout = setTimeout(async () => {
      const results = await searchSkills(query.trim());
      if (!cancelled) setSearchResults(results);
    }, 200);
    return () => { cancelled = true; clearTimeout(timeout); };
  }, [query]);

  const visibleCategories = useMemo(() => {
    if (activeGroup !== null) return categories.filter((c) => c.group_id === activeGroup);
    return categories;
  }, [categories, activeGroup]);

  const visibleSkills = useMemo(() => {
    if (searchResults) return searchResults;
    if (activeCategory !== null) return skills.filter((s) => s.category_id === activeCategory);
    if (activeGroup !== null) {
      const catIds = new Set(categories.filter((c) => c.group_id === activeGroup).map((c) => c.id));
      return skills.filter((s) => s.category_id !== null && catIds.has(s.category_id));
    }
    return skills;
  }, [skills, searchResults, activeGroup, activeCategory, categories]);

  const sections = useMemo(() => {
    if (searchResults || activeCategory !== null) {
      return [{ key: "results", name: null, skills: visibleSkills }];
    }

    const grouped: { key: string; name: string | null; categoryName: string | null; skills: Skill[] }[] = [];
    const byCategory = new Map<number, Skill[]>();
    const uncategorised: Skill[] = [];

    for (const skill of visibleSkills) {
      if (skill.category_id !== null) {
        const list = byCategory.get(skill.category_id) ?? [];
        list.push(skill);
        byCategory.set(skill.category_id, list);
      } else {
        uncategorised.push(skill);
      }
    }

    for (const cat of visibleCategories) {
      const catSkills = byCategory.get(cat.id);
      if (catSkills && catSkills.length > 0) {
        grouped.push({ key: `cat-${cat.id}`, name: cat.name, categoryName: cat.name, skills: catSkills });
      }
    }

    if (uncategorised.length > 0) {
      grouped.push({ key: "uncategorised", name: groups.length > 0 ? "Other" : null, categoryName: null, skills: uncategorised });
    }

    return grouped;
  }, [visibleSkills, visibleCategories, searchResults, activeCategory, groups.length]);

  function handleGroupToggle(groupId: number) {
    if (activeGroup === groupId) {
      setActiveGroup(null);
      setActiveCategory(null);
    } else {
      setActiveGroup(groupId);
      setActiveCategory(null);
    }
  }

  function handleCategoryToggle(categoryId: number) {
    setActiveCategory(activeCategory === categoryId ? null : categoryId);
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <Header
        title="SkillsLab"
        onSettings={() => navigate("/settings")}
      />

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="max-w-2xl">
          <p className="text-stone-500">
            Select a skill to review its videos, storyboards, guides and images.
          </p>
        </div>

        <div className="mt-6 max-w-md">
          <SearchBar value={query} onChange={setQuery} />
        </div>

        {groups.length > 0 && !searchResults && (
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-stone-400">Group</span>
            <button
              onClick={() => { setActiveGroup(null); setActiveCategory(null); }}
              className={chipClass(activeGroup === null && activeCategory === null)}
            >
              All
            </button>
            {groups.map((g) => (
              <button key={g.id} onClick={() => handleGroupToggle(g.id)} className={chipClass(activeGroup === g.id)}>
                {g.name}
              </button>
            ))}
          </div>
        )}

        {visibleCategories.length > 0 && !searchResults && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-stone-400">Category</span>
            {visibleCategories.map((c) => (
              <button key={c.id} onClick={() => handleCategoryToggle(c.id)} className={chipClass(activeCategory === c.id)}>
                {c.name}
              </button>
            ))}
          </div>
        )}

        {searchResults && (
          <p className="mt-6 text-sm text-stone-400">
            {searchResults.length === 1 ? "1 skill matches" : `${searchResults.length} skills match`} "{query}"
          </p>
        )}

        {visibleSkills.length === 0 ? (
          <div className="mt-16 rounded-2xl border border-dashed border-stone-300 p-12 text-center">
            <p className="font-medium text-stone-600">No skills found</p>
            <p className="mt-1 text-sm text-stone-400">
              {query ? "Try a different search term." : "No content has been loaded yet."}
            </p>
          </div>
        ) : (
          <div className="mt-8 space-y-10">
            {sections.map((section) => (
              <section key={section.key}>
                {section.name && (
                  <h2 className="mb-4 border-b border-stone-200 pb-2 text-sm font-semibold uppercase tracking-wide text-stone-400">
                    {section.name}
                  </h2>
                )}
                <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {section.skills.map((skill) => (
                    <SkillCard key={skill.id} skill={skill} navigate={navigate} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function SkillCard({ skill, navigate }: { skill: Skill; navigate: (path: string) => void }) {
  const thumb = assetUrl(skill.thumbnail_asset);

  return (
    <li>
      <button
        onClick={() => navigate(`/skill/${skill.slug}`)}
        className="group flex h-full w-full flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md"
      >
        {thumb && (
          <img
            src={thumb}
            alt=""
            className="aspect-video w-full border-b border-stone-100 object-cover"
          />
        )}
        <div className="flex flex-1 flex-col p-5">
          <h3 className="text-base font-semibold tracking-tight group-hover:text-teal-700">
            {skill.title}
          </h3>
          {skill.description && (
            <p className="mt-1.5 line-clamp-3 flex-1 text-sm leading-relaxed text-stone-500">
              {skill.description}
            </p>
          )}
        </div>
      </button>
    </li>
  );
}

function chipClass(active: boolean): string {
  return `rounded-full px-3.5 py-1.5 text-sm transition ${
    active
      ? "bg-stone-900 text-white"
      : "bg-white text-stone-600 ring-1 ring-stone-200 hover:ring-stone-300"
  }`;
}
