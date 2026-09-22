import { useEffect, useId, useState, useMemo } from "react";
import type { Group, Category, Skill } from "@/data/types";
import { getReleaseInfo, listGroups, listCategories, listSkills, searchSkills } from "@/data/catalogue";
import { assetUrl } from "@/data/assets";
import Header from "@/components/Header";
import PageTitle from "@/components/PageTitle";
import SearchBar from "@/components/SearchBar";
import BrandMark from "@/components/BrandMark";
import Button from "@/components/Button";
import EmptyState from "@/components/EmptyState";
import { SearchIcon, SettingsIcon, StoryboardIcon } from "@/components/icons";

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
  const [version, setVersion] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [latestSearch, setLatestSearch] = useState<{ term: string; results: Skill[] } | null>(null);
  const [activeGroup, setActiveGroup] = useState<number | null>(null);
  const [activeCategory, setActiveCategory] = useState<number | null>(null);

  useEffect(() => {
    async function load() {
      const [g, c, s, release] = await Promise.all([listGroups(), listCategories(), listSkills(), getReleaseInfo()]);
      setGroups(g);
      setCategories(c);
      setSkills(s);
      setVersion(release?.version ?? null);
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

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);

  const skillCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const s of skills) {
      if (s.category_id !== null) counts.set(s.category_id, (counts.get(s.category_id) ?? 0) + 1);
    }
    return counts;
  }, [skills]);

  const groupCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const c of categories) {
      if (c.group_id !== null) counts.set(c.group_id, (counts.get(c.group_id) ?? 0) + (skillCounts.get(c.id) ?? 0));
    }
    return counts;
  }, [categories, skillCounts]);

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
    if (searchResults || activeCategory !== null) {
      return [{ key: "results", name: null, skills: visibleSkills }];
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
  }, [visibleSkills, visibleCategories, searchResults, activeCategory, groups.length]);

  function selectAll() {
    setActiveGroup(null);
    setActiveCategory(null);
  }

  function selectGroup(groupId: number) {
    setActiveGroup(groupId);
    setActiveCategory(null);
  }

  function selectCategory(category: Category) {
    setActiveGroup(category.group_id);
    setActiveCategory(category.id);
  }

  /** Sidebar choices also clear any search, so the grid shows the choice. */
  function browse(select: () => void) {
    setQuery("");
    select();
  }

  const searching = searchResults !== null;
  const activeCategoryInfo = activeCategory !== null ? categoryById.get(activeCategory) : undefined;
  const activeGroupInfo = activeGroup !== null ? groupById.get(activeGroup) : undefined;

  // The large title follows what the user is looking at.
  let eyebrow = "Skills library";
  let title: React.ReactNode = "Clinical skills";
  if (searching) {
    eyebrow = "Search";
    title = (
      <>
        Results for <em className="italic text-accent-ink">“{latestSearch?.term}”</em>
      </>
    );
  } else if (activeCategoryInfo) {
    eyebrow = activeGroupInfo?.name ?? "Category";
    title = activeCategoryInfo.name;
  } else if (activeGroupInfo) {
    eyebrow = "Group";
    title = activeGroupInfo.name;
  }

  const ungroupedCategories = categories.filter((c) => c.group_id === null);
  const allSelected = !searching && activeGroup === null && activeCategory === null;

  return (
    <div className="min-h-screen bg-canvas lg:flex">
      {/* Landscape: a persistent library sidebar, as in an iPadOS split view. */}
      <aside
        aria-label="Library"
        className="sticky top-0 hidden h-dvh w-[19rem] shrink-0 flex-col border-r border-line bg-sidebar px-4 pb-4 pt-[calc(env(safe-area-inset-top)+1.5rem)] lg:flex"
      >
        <div className="flex items-center gap-3 px-2">
          <BrandMark className="h-9 w-9 drop-shadow-sm" />
          <div className="leading-tight">
            <p className="text-[1.0625rem] font-semibold tracking-[-0.02em]">SkillsLab</p>
            <p className="font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-ink-3">Reader</p>
          </div>
        </div>

        <div className="mt-6">
          <SearchBar value={query} onChange={setQuery} />
        </div>

        <nav aria-label="Browse skills" className="-mx-1 mt-6 flex-1 overflow-y-auto px-1 scrollbar-none">
          <SidebarItem
            label="All skills"
            count={skills.length}
            active={allSelected}
            onClick={() => browse(selectAll)}
            strong
          />

          {groups.map((g) => (
            <div key={g.id} className="mt-5">
              <SidebarItem
                label={g.name}
                count={groupCounts.get(g.id) ?? 0}
                active={!searching && activeGroup === g.id && activeCategory === null}
                onClick={() => browse(() => selectGroup(g.id))}
                strong
              />
              <div className="mt-0.5 space-y-0.5">
                {categories.filter((c) => c.group_id === g.id).map((c) => (
                  <SidebarItem
                    key={c.id}
                    label={c.name}
                    count={skillCounts.get(c.id) ?? 0}
                    active={!searching && activeCategory === c.id}
                    onClick={() => browse(() => selectCategory(c))}
                    indent
                  />
                ))}
              </div>
            </div>
          ))}

          {ungroupedCategories.length > 0 && (
            <div className="mt-5 space-y-0.5">
              {ungroupedCategories.map((c) => (
                <SidebarItem
                  key={c.id}
                  label={c.name}
                  count={skillCounts.get(c.id) ?? 0}
                  active={!searching && activeCategory === c.id}
                  onClick={() => browse(() => selectCategory(c))}
                />
              ))}
            </div>
          )}
        </nav>

        <div className="mt-3 border-t border-line pt-3">
          <button
            type="button"
            onClick={() => navigate("/settings")}
            className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[0.9375rem] text-ink-2 transition hover:bg-surface/60 hover:text-ink active:opacity-60"
          >
            <SettingsIcon className="h-5 w-5" />
            <span className="flex-1">Settings</span>
            {version && <span className="font-mono text-[0.75rem] text-ink-3">v{version}</span>}
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <Header brand title="Clinical skills" onSettings={() => navigate("/settings")} className="lg:hidden" />

        <main className="safe-bottom px-6 pb-24 pt-6 sm:px-10 lg:px-14 lg:pt-[calc(env(safe-area-inset-top)+3.5rem)]">
          <div className="mx-auto max-w-[68rem]">
            <header key={`${searching}-${activeGroup}-${activeCategory}`} className="animate-rise">
              <PageTitle eyebrow={eyebrow} title={title} size="xl" />
              {loaded && (
                <p className="mt-5 flex flex-wrap gap-x-6 gap-y-1 font-mono text-[0.8125rem] tabular-nums text-ink-3">
                  <span>
                    <span className="text-ink">{String(visibleSkills.length).padStart(2, "0")}</span>{" "}
                    {visibleSkills.length === 1 ? "skill" : "skills"}
                  </span>
                  {!searching && activeCategory === null && visibleCategories.length > 0 && (
                    <span>
                      <span className="text-ink">{String(visibleCategories.length).padStart(2, "0")}</span>{" "}
                      {visibleCategories.length === 1 ? "category" : "categories"}
                    </span>
                  )}
                  {version && allSelected && <span>Content v{version}</span>}
                </p>
              )}
            </header>

            {/* Portrait: search and filters sit above the grid. */}
            <div className="mt-8 space-y-4 lg:hidden">
              <SearchBar value={query} onChange={setQuery} />
              {!searching && categories.length > 0 && (
                <div
                  role="group"
                  aria-label="Filter skills"
                  className="-mx-6 flex gap-2 overflow-x-auto px-6 py-0.5 scrollbar-none sm:-mx-10 sm:px-10"
                >
                  <Chip active={activeGroup === null && activeCategory === null} onClick={selectAll}>
                    All
                  </Chip>
                  {groups.length > 0 && activeGroup === null
                    ? groups.map((g) => (
                        <Chip key={g.id} active={false} onClick={() => selectGroup(g.id)} count={groupCounts.get(g.id)}>
                          {g.name}
                        </Chip>
                      ))
                    : visibleCategories.map((c) => (
                        <Chip
                          key={c.id}
                          active={activeCategory === c.id}
                          onClick={() => (activeCategory === c.id ? setActiveCategory(null) : selectCategory(c))}
                          count={skillCounts.get(c.id)}
                        >
                          {c.name}
                        </Chip>
                      ))}
                </div>
              )}
            </div>

            <p role="status" className="sr-only">
              {searching &&
                `${searchResults.length === 1 ? "1 result" : `${searchResults.length} results`} for ${latestSearch?.term}`}
            </p>

            {!loaded ? (
              <SkeletonGrid />
            ) : visibleSkills.length === 0 ? (
              <div className="mt-12">
                <EmptyState
                  outlined
                  icon={searching ? <SearchIcon className="h-7 w-7" /> : <StoryboardIcon className="h-7 w-7" />}
                  title={searching ? "No matching skills" : "No skills yet"}
                  action={searching && <Button variant="secondary" onClick={() => setQuery("")}>Clear search</Button>}
                >
                  {searching
                    ? "Check the spelling, or search for a category or procedure name."
                    : "This content package doesn’t include any skills yet."}
                </EmptyState>
              </div>
            ) : (
              <div className="mt-12 space-y-16 lg:mt-14">
                {sections.map((section) => (
                  <SkillSection
                    key={section.key}
                    section={section}
                    categories={searching ? categoryById : null}
                    navigate={navigate}
                  />
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function SidebarItem({
  label,
  count,
  active,
  onClick,
  strong,
  indent,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  strong?: boolean;
  indent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={`flex min-h-11 w-full items-center gap-3 rounded-xl pr-3 text-left text-[0.9375rem] transition duration-150 active:scale-[0.98] ${
        indent ? "pl-5" : "pl-3"
      } ${
        active
          ? "bg-surface text-ink shadow-card ring-1 ring-line"
          : `${strong ? "text-ink" : "text-ink-2"} hover:bg-surface/60`
      }`}
    >
      {indent && (
        <span
          aria-hidden="true"
          className={`h-1.5 w-1.5 shrink-0 rounded-full transition ${active ? "bg-accent" : "bg-line-strong"}`}
        />
      )}
      <span className={`min-w-0 flex-1 truncate ${strong ? "font-semibold" : active ? "font-medium" : ""}`}>
        {label}
      </span>
      <span className={`font-mono text-[0.75rem] tabular-nums ${active ? "text-accent-ink" : "text-ink-3"}`}>
        {count}
      </span>
    </button>
  );
}

function Chip({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4.5 text-[0.9375rem] font-medium ring-1 ring-inset transition duration-150 active:scale-[0.97] ${
        active ? "bg-ink text-canvas ring-ink" : "bg-surface text-ink ring-line hover:ring-line-strong"
      }`}
    >
      {children}
      {count !== undefined && (
        <span aria-hidden="true" className={`font-mono text-[0.75rem] tabular-nums ${active ? "opacity-70" : "text-ink-3"}`}>
          {count}
        </span>
      )}
    </button>
  );
}

function SkillSection({
  section,
  categories,
  navigate,
}: {
  section: Section;
  categories: Map<number, Category> | null;
  navigate: (path: string) => void;
}) {
  const headingId = useId();

  return (
    <section aria-labelledby={section.name ? headingId : undefined}>
      {section.name && (
        <div className="mb-7 flex items-baseline justify-between gap-4 border-t border-line pt-5">
          <h2 id={headingId} className="font-display text-[1.75rem] leading-tight tracking-[-0.018em]">
            {section.name}
          </h2>
          <span className="font-mono text-[0.75rem] uppercase tracking-[0.12em] tabular-nums text-ink-3">
            {section.skills.length === 1 ? "1 skill" : `${section.skills.length} skills`}
          </span>
        </div>
      )}
      <ul className="grid grid-cols-1 gap-x-7 gap-y-11 sm:grid-cols-2 xl:grid-cols-3">
        {section.skills.map((skill, i) => (
          <SkillCard
            key={skill.id}
            index={i + 1}
            skill={skill}
            categoryName={
              categories && skill.category_id !== null ? categories.get(skill.category_id)?.name : undefined
            }
            navigate={navigate}
          />
        ))}
      </ul>
    </section>
  );
}

function SkillCard({
  index,
  skill,
  categoryName,
  navigate,
}: {
  index: number;
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
        className="group block w-full rounded-[1.25rem] text-left [outline-offset:6px]"
      >
        <div className="relative aspect-[3/2] overflow-hidden rounded-[1.25rem] bg-surface-2 shadow-card transition duration-300 group-hover:shadow-raised group-active:scale-[0.985]">
          {thumb ? (
            <img
              src={thumb}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition duration-700 ease-out group-hover:scale-[1.04]"
            />
          ) : (
            <ThumbnailFallback title={skill.title} />
          )}
          <div className="pointer-events-none absolute inset-0 rounded-[1.25rem] ring-1 ring-inset ring-black/[0.06]" />
        </div>
        <div className="mt-4 flex gap-4 px-0.5">
          <span aria-hidden="true" className="pt-[0.2rem] font-mono text-[0.75rem] tabular-nums text-ink-3">
            {String(index).padStart(2, "0")}
          </span>
          <div className="min-w-0 flex-1">
            {categoryName && (
              <p className="mb-1 font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-accent-ink">{categoryName}</p>
            )}
            <h3
              id={titleId}
              className="text-[1.0625rem] font-medium leading-snug tracking-[-0.012em] text-ink transition-colors group-hover:text-accent-ink"
            >
              {skill.title}
            </h3>
            {skill.description && (
              <p id={descriptionId} className="mt-1.5 line-clamp-2 text-[0.9375rem] leading-relaxed text-ink-2">
                {skill.description}
              </p>
            )}
          </div>
        </div>
      </button>
    </li>
  );
}

/** Stand-in artwork for skills published without a thumbnail. */
function ThumbnailFallback({ title }: { title: string }) {
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-gradient-to-br from-accent-soft to-surface-2">
      <span
        aria-hidden="true"
        className="absolute -bottom-7 left-5 font-display text-[8rem] italic leading-none text-accent opacity-[0.12]"
      >
        {title.charAt(0)}
      </span>
      <svg viewBox="0 0 200 60" className="relative w-1/2 text-accent opacity-60" aria-hidden="true" focusable="false">
        <path
          d="M0 32 H66 L76 12 L90 52 L100 32 H122 L128 26 L134 32 H200"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="mt-12 grid grid-cols-1 gap-x-7 gap-y-11 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i}>
          <div className="aspect-[3/2] animate-pulse rounded-[1.25rem] bg-surface-2" />
          <div className="mt-4 space-y-2.5 pl-8">
            <div className="h-4 w-2/3 animate-pulse rounded bg-surface-3" />
            <div className="h-3.5 w-full animate-pulse rounded bg-surface-2" />
          </div>
        </div>
      ))}
    </div>
  );
}
