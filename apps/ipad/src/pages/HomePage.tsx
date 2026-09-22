import { useEffect, useId, useState, useMemo } from "react";
import type { Group, Category, Skill } from "@/data/types";
import { listGroups, listCategories, listSkills, searchSkills } from "@/data/catalogue";
import { assetUrl } from "@/data/assets";
import Header from "@/components/Header";
import PageTitle from "@/components/PageTitle";
import SearchBar from "@/components/SearchBar";
import Button from "@/components/Button";
import EmptyState from "@/components/EmptyState";
import { SearchIcon, StoryboardIcon } from "@/components/icons";

interface HomePageProps {
  navigate: (path: string) => void;
}

interface Section {
  key: string;
  name: string | null;
  skills: Skill[];
}

export default function HomePage({ navigate }: HomePageProps) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [latestSearch, setLatestSearch] = useState<{ term: string; results: Skill[] } | null>(null);
  const [activeGroup, setActiveGroup] = useState<number | null>(null);
  const [activeCategory, setActiveCategory] = useState<number | null>(null);

  useEffect(() => {
    async function load() {
      const [g, c, s] = await Promise.all([listGroups(), listCategories(), listSkills()]);
      setGroups(g);
      setCategories(c);
      setSkills(s);
      setLoaded(true);
    }
    load();
  }, []);

  const term = query.trim();
  // Keep showing the previous results while the next search is debounced,
  // rather than flashing the full library between keystrokes.
  const searchResults = term ? latestSearch?.results ?? null : null;

  useEffect(() => {
    if (!term) return;
    let cancelled = false;
    const timeout = setTimeout(async () => {
      const results = await searchSkills(term);
      if (!cancelled) setLatestSearch({ term, results });
    }, 200);
    return () => { cancelled = true; clearTimeout(timeout); };
  }, [term]);

  const categoryNames = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories]
  );

  const skillCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const s of skills) {
      if (s.category_id !== null) counts.set(s.category_id, (counts.get(s.category_id) ?? 0) + 1);
    }
    return counts;
  }, [skills]);

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

  const sections = useMemo((): Section[] => {
    if (searchResults) {
      return [{ key: "results", name: null, skills: visibleSkills }];
    }
    if (activeCategory !== null) {
      return [{ key: `cat-${activeCategory}`, name: categoryNames.get(activeCategory) ?? null, skills: visibleSkills }];
    }

    const grouped: Section[] = [];
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
        grouped.push({ key: `cat-${cat.id}`, name: cat.name, skills: catSkills });
      }
    }

    if (uncategorised.length > 0) {
      grouped.push({ key: "uncategorised", name: groups.length > 0 ? "Other" : null, skills: uncategorised });
    }

    return grouped;
  }, [visibleSkills, visibleCategories, searchResults, activeCategory, categoryNames, groups.length]);

  function handleGroupSelect(groupId: number | null) {
    setActiveGroup(groupId);
    setActiveCategory(null);
  }

  function handleCategoryToggle(categoryId: number) {
    setActiveCategory(activeCategory === categoryId ? null : categoryId);
  }

  const searching = searchResults !== null;

  return (
    <div className="min-h-screen bg-canvas">
      <Header brand title="Clinical skills" onSettings={() => navigate("/settings")} />

      <main className="safe-bottom mx-auto max-w-6xl px-5 pb-20 sm:px-8">
        <div className="flex flex-col gap-6 pt-2 lg:flex-row lg:items-end lg:justify-between lg:gap-12">
          <PageTitle title="Clinical skills">
            {loaded && <LibrarySummary skills={skills.length} categories={categories.length} />}
          </PageTitle>
          <div className="w-full shrink-0 lg:w-[22rem]">
            <SearchBar value={query} onChange={setQuery} />
          </div>
        </div>

        {!searching && (groups.length > 0 || visibleCategories.length > 0) && (
          <div className="mt-8 space-y-3">
            {groups.length > 0 && (
              <div
                role="group"
                aria-label="Filter by group"
                className="inline-flex max-w-full gap-1 overflow-x-auto rounded-[0.9rem] bg-surface-2 p-1 scrollbar-none"
              >
                <SegmentButton active={activeGroup === null} onClick={() => handleGroupSelect(null)}>
                  All skills
                </SegmentButton>
                {groups.map((g) => (
                  <SegmentButton key={g.id} active={activeGroup === g.id} onClick={() => handleGroupSelect(g.id)}>
                    {g.name}
                  </SegmentButton>
                ))}
              </div>
            )}

            {visibleCategories.length > 0 && (
              <div
                role="group"
                aria-label="Filter by category"
                className="-mx-5 flex gap-2 overflow-x-auto px-5 py-0.5 scrollbar-none sm:-mx-8 sm:flex-wrap sm:px-8"
              >
                {visibleCategories.map((c) => (
                  <CategoryChip
                    key={c.id}
                    name={c.name}
                    count={skillCounts.get(c.id) ?? 0}
                    active={activeCategory === c.id}
                    onClick={() => handleCategoryToggle(c.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        <p role="status" className={searching ? "mt-8 text-[0.9375rem] text-ink-2" : "sr-only"}>
          {searching &&
            `${searchResults.length === 1 ? "1 result" : `${searchResults.length} results`} for “${latestSearch?.term}”`}
        </p>

        {!loaded ? (
          <SkeletonGrid />
        ) : visibleSkills.length === 0 ? (
          <div className="mt-10">
            <EmptyState
              outlined
              icon={searching ? <SearchIcon className="h-7 w-7" /> : <StoryboardIcon className="h-7 w-7" />}
              title={searching ? "No matching skills" : "No skills yet"}
              action={
                searching && (
                  <Button variant="secondary" onClick={() => setQuery("")}>
                    Clear search
                  </Button>
                )
              }
            >
              {searching
                ? "Check the spelling, or search for a category or procedure name."
                : "This content package doesn’t include any skills yet."}
            </EmptyState>
          </div>
        ) : (
          <div className={searching ? "mt-5 space-y-12" : "mt-10 space-y-12"}>
            {sections.map((section) => (
              <SkillSection
                key={section.key}
                section={section}
                categoryNames={searching ? categoryNames : null}
                navigate={navigate}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function LibrarySummary({ skills, categories }: { skills: number; categories: number }) {
  const skillText = skills === 1 ? "1 skill" : `${skills} skills`;
  const categoryText = categories === 1 ? "1 category" : `${categories} categories`;
  return (
    <p>
      {categories > 0 ? `${skillText} across ${categoryText}.` : `${skillText}.`}{" "}
      Choose one to review its videos, storyboards, guides and images.
    </p>
  );
}

function SkillSection({
  section,
  categoryNames,
  navigate,
}: {
  section: Section;
  categoryNames: Map<number, string> | null;
  navigate: (path: string) => void;
}) {
  const headingId = useId();

  return (
    <section aria-labelledby={section.name ? headingId : undefined}>
      {section.name && (
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h2 id={headingId} className="text-[1.3125rem] font-semibold tracking-[-0.015em]">
            {section.name}
          </h2>
          <span className="text-[0.9375rem] tabular-nums text-ink-3">
            {section.skills.length === 1 ? "1 skill" : `${section.skills.length} skills`}
          </span>
        </div>
      )}
      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {section.skills.map((skill) => (
          <SkillCard
            key={skill.id}
            skill={skill}
            categoryName={
              categoryNames && skill.category_id !== null ? categoryNames.get(skill.category_id) : undefined
            }
            navigate={navigate}
          />
        ))}
      </ul>
    </section>
  );
}

function SkillCard({
  skill,
  categoryName,
  navigate,
}: {
  skill: Skill;
  categoryName?: string;
  navigate: (path: string) => void;
}) {
  const thumb = assetUrl(skill.thumbnail_asset);
  const titleId = useId();
  const descriptionId = useId();

  return (
    <li>
      <button
        type="button"
        onClick={() => navigate(`/skill/${skill.slug}`)}
        // Name the button by its title alone; the description is read after
        // it, so VoiceOver doesn't announce a paragraph as the control name.
        aria-labelledby={titleId}
        aria-describedby={skill.description ? descriptionId : undefined}
        className="group flex h-full w-full flex-col overflow-hidden rounded-2xl bg-surface text-left shadow-card ring-1 ring-line transition duration-200 hover:-translate-y-0.5 hover:shadow-raised active:scale-[0.985]"
      >
        <div className="relative aspect-[16/10] w-full overflow-hidden bg-surface-2">
          {thumb ? (
            <img
              src={thumb}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
            />
          ) : (
            <ThumbnailFallback />
          )}
          <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-black/5" />
        </div>
        <div className="flex flex-1 flex-col px-5 pb-5 pt-4">
          {categoryName && (
            <p className="mb-1 text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-accent-ink">
              {categoryName}
            </p>
          )}
          <h3 id={titleId} className="text-[1.0625rem] font-semibold leading-snug tracking-[-0.01em] text-ink">
            {skill.title}
          </h3>
          {skill.description && (
            <p id={descriptionId} className="mt-1.5 line-clamp-2 text-[0.9375rem] leading-relaxed text-ink-2">
              {skill.description}
            </p>
          )}
        </div>
      </button>
    </li>
  );
}

/** Stand-in artwork for skills published without a thumbnail. */
function ThumbnailFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-accent-soft via-surface-2 to-surface-2">
      <svg viewBox="0 0 200 60" className="w-3/5 text-accent opacity-50" aria-hidden="true" focusable="false">
        <path
          d="M0 32 H66 L76 12 L90 52 L100 32 H122 L128 26 L134 32 H200"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="mt-10" aria-hidden="true">
      <div className="mb-4 h-6 w-48 animate-pulse rounded-lg bg-surface-3" />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
            <div className="aspect-[16/10] animate-pulse bg-surface-2" />
            <div className="space-y-2.5 p-5">
              <div className="h-4 w-2/3 animate-pulse rounded bg-surface-3" />
              <div className="h-3.5 w-full animate-pulse rounded bg-surface-2" />
              <div className="h-3.5 w-4/5 animate-pulse rounded bg-surface-2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SegmentButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-11 shrink-0 whitespace-nowrap rounded-[0.7rem] px-5 text-[0.9375rem] transition duration-200 ${
        active
          ? "bg-surface font-semibold text-ink shadow-[0_1px_3px_rgb(0_0_0/0.1),0_1px_1px_rgb(0_0_0/0.04)] dark:bg-surface-3"
          : "font-medium text-ink-2 hover:text-ink active:opacity-60"
      }`}
    >
      {children}
    </button>
  );
}

function CategoryChip({
  name,
  count,
  active,
  onClick,
}: {
  name: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 text-[0.9375rem] font-medium ring-1 ring-inset transition duration-150 active:scale-[0.97] ${
        active
          ? "bg-accent text-on-accent ring-accent"
          : "bg-surface text-ink ring-line hover:ring-line-strong"
      }`}
    >
      {name}
      <span className={`tabular-nums ${active ? "opacity-80" : "text-ink-3"}`} aria-hidden="true">
        {count}
      </span>
    </button>
  );
}
