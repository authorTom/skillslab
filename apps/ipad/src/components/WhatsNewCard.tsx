import { useId, useState } from "react";
import type { ChangedSkill, WhatsNew } from "@/data/whatsNew";
import { CloseIcon, SparklesIcon } from "./icons";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * What the latest content update changed, on the home screen until someone
 * dismisses it: handy for a tutor briefing a group at the start of a session.
 * New and updated skills open with a tap.
 */
export default function WhatsNewCard({
  whatsNew,
  onOpen,
  onDismiss,
}: {
  whatsNew: WhatsNew;
  onOpen: (slug: string) => void;
  onDismiss: () => void;
}) {
  const headingId = useId();
  const [expanded, setExpanded] = useState(false);
  const { added, updated, removed } = whatsNew;
  const summary = [
    added.length > 0 && plural(added.length, "new skill", "new skills"),
    updated.length > 0 && plural(updated.length, "updated", "updated"),
    removed.length > 0 && plural(removed.length, "removed", "removed"),
  ]
    .filter(Boolean)
    .join(" · ");
  const total = added.length + updated.length;
  // A short list is shown whole; a long one starts folded.
  const folded = total > 6 && !expanded;
  const shown = folded
    ? [...added.map((s) => ({ ...s, kind: "new" as const })), ...updated.map((s) => ({ ...s, kind: "updated" as const }))].slice(0, 6)
    : null;

  return (
    <section
      aria-labelledby={headingId}
      className="mt-8 animate-rise rounded-[1.25rem] bg-surface p-5 shadow-card ring-1 ring-line sm:p-6"
    >
      <div className="flex items-start gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-ink">
          <SparklesIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={headingId} className="text-[1.0625rem] font-semibold tracking-[-0.01em] text-ink">
            What’s new in content v{whatsNew.version}
          </h2>
          <p className="mt-0.5 text-[0.9375rem] text-ink-2">
            {summary}
            {whatsNew.fromVersion && <span className="text-ink-3"> · since v{whatsNew.fromVersion}</span>}
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss what’s new"
          className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-3 transition hover:bg-surface-2 active:bg-surface-3"
        >
          <CloseIcon className="h-5 w-5" />
        </button>
      </div>

      {shown ? (
        <ul className="mt-4 flex flex-wrap gap-2">
          {shown.map((s) => (
            <SkillChip key={s.slug} skill={s} kind={s.kind} onOpen={onOpen} />
          ))}
          <li>
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="min-h-11 rounded-full px-4 text-[0.9375rem] font-medium text-accent-ink transition hover:bg-accent-soft"
            >
              Show all {total}
            </button>
          </li>
        </ul>
      ) : (
        <>
          {added.length > 0 && <ChangeList label="New" kind="new" skills={added} onOpen={onOpen} />}
          {updated.length > 0 && <ChangeList label="Updated" kind="updated" skills={updated} onOpen={onOpen} />}
        </>
      )}
      {removed.length > 0 && (
        <p className="mt-4 text-[0.875rem] leading-relaxed text-ink-3">
          <span className="font-medium text-ink-2">Removed:</span> {removed.join(", ")}
        </p>
      )}
    </section>
  );
}

function ChangeList({
  label,
  kind,
  skills,
  onOpen,
}: {
  label: string;
  kind: "new" | "updated";
  skills: ChangedSkill[];
  onOpen: (slug: string) => void;
}) {
  return (
    <div className="mt-4">
      <p className="font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-ink-3">{label}</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {skills.map((s) => (
          <SkillChip key={s.slug} skill={s} kind={kind} onOpen={onOpen} />
        ))}
      </ul>
    </div>
  );
}

function SkillChip({
  skill,
  kind,
  onOpen,
}: {
  skill: ChangedSkill;
  kind: "new" | "updated";
  onOpen: (slug: string) => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(skill.slug)}
        className="inline-flex min-h-11 items-center gap-2 rounded-full bg-surface-2 py-1 pl-2 pr-4 text-[0.9375rem] font-medium text-ink ring-1 ring-inset ring-line transition hover:ring-line-strong active:scale-[0.97]"
      >
        <span
          className={`rounded-full px-2 py-0.5 font-mono text-[0.625rem] uppercase tracking-[0.1em] ${
            kind === "new" ? "bg-accent text-on-accent" : "bg-surface-3 text-ink-2"
          }`}
        >
          {kind === "new" ? "New" : "Updated"}
        </span>
        {skill.title}
      </button>
    </li>
  );
}
