import type { KeyPointSection, KeyPointTone } from "@/data/keyPoints";
import { AlertIcon } from "./icons";

const CARD: Record<KeyPointTone, string> = {
  plain: "bg-surface ring-line",
  caution: "bg-warning-soft/60 ring-warning-ink/20",
  danger: "bg-danger-soft ring-danger-ink/25",
};

const HEADING: Record<KeyPointTone, string> = {
  plain: "text-ink",
  caution: "text-warning-ink",
  danger: "text-danger-ink",
};

const MARKER: Record<KeyPointTone, string> = {
  plain: "bg-accent",
  caution: "bg-warning-ink",
  danger: "bg-danger-ink",
};

/** A skill's key points: what to know before starting. Red flags and
 *  cautions are tinted so they stand out at a glance. */
export default function KeyPointsPanel({ sections }: { sections: KeyPointSection[] }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {sections.map((section) => (
        <section
          key={section.key}
          aria-labelledby={`kp-${section.key}`}
          className={`rounded-[1.25rem] p-5 shadow-card ring-1 ring-inset ${CARD[section.tone]} ${
            section.key === "red_flags" ? "xl:col-span-2" : ""
          }`}
        >
          <h2
            id={`kp-${section.key}`}
            className={`flex items-center gap-2 text-[1.0625rem] font-semibold tracking-[-0.01em] ${HEADING[section.tone]}`}
          >
            {section.tone === "danger" && <AlertIcon className="h-5 w-5" />}
            {section.label}
          </h2>
          <ul className="mt-3 space-y-2">
            {section.items.map((item, i) => (
              <li key={i} className="flex gap-3 text-[1rem] leading-snug text-ink">
                <span aria-hidden="true" className={`mt-[0.5rem] h-1.5 w-1.5 shrink-0 rounded-full ${MARKER[section.tone]}`} />
                <span className="min-w-0">{item}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
