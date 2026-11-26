import { KEY_POINT_FIELDS, keyPointItems, type KeyPoints as KeyPointValues } from "@/lib/key-points";

/** Styling per field: red flags stand out, the rest stay quiet. */
const TONES: Record<string, string> = {
  red_flags: "border-red-200 bg-red-50/60",
  contraindications: "border-amber-200 bg-amber-50/50",
};

const MARKERS: Record<string, string> = {
  red_flags: "bg-red-500",
  contraindications: "bg-amber-500",
};

/** A course's key points, as a grid of short lists. Fields left empty are skipped. */
export default function KeyPoints({ points }: { points: KeyPointValues }) {
  const sections = KEY_POINT_FIELDS.map((field) => ({ ...field, items: keyPointItems(points[field.key]) })).filter(
    (section) => section.items.length > 0
  );
  if (sections.length === 0) return null;

  return (
    <section aria-labelledby="key-points-heading" className="mt-10">
      <h2 id="key-points-heading" className="mb-3 text-xs font-semibold uppercase tracking-wider text-stone-400">
        Key points
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((section) => (
          <div
            key={section.key}
            className={`rounded-2xl border p-5 ${TONES[section.key] ?? "border-stone-200 bg-white"}`}
          >
            <h3 className="text-sm font-semibold text-stone-800">{section.label}</h3>
            <ul className="mt-3 space-y-1.5 text-sm leading-relaxed text-stone-600">
              {section.items.map((item, i) => (
                <li key={i} className="flex gap-2.5">
                  <span
                    aria-hidden
                    className={`mt-[0.55rem] h-1.5 w-1.5 shrink-0 rounded-full ${MARKERS[section.key] ?? "bg-teal-500"}`}
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
