const inputClass =
  "w-full rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100";

export default function SkillFields({
  defaults,
}: {
  defaults?: { title: string; category: string; description: string };
}) {
  return (
    <>
      <div>
        <label htmlFor="title" className="mb-1.5 block text-sm font-medium text-stone-700">
          Title
        </label>
        <input
          id="title"
          name="title"
          required
          defaultValue={defaults?.title}
          placeholder="e.g. Venepuncture"
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="category" className="mb-1.5 block text-sm font-medium text-stone-700">
          Category
        </label>
        <input
          id="category"
          name="category"
          defaultValue={defaults?.category}
          placeholder="e.g. Procedures"
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="description" className="mb-1.5 block text-sm font-medium text-stone-700">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={4}
          defaultValue={defaults?.description}
          placeholder="A short summary shown to learners…"
          className={inputClass}
        />
      </div>
    </>
  );
}
