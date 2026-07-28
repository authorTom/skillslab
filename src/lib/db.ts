import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { slugify } from "./slug";

export const DATA_DIR = path.join(process.cwd(), "data");
export const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

declare global {
  var __clinicalSkillsDb: Database.Database | undefined;
}

export function getDb(): Database.Database {
  if (globalThis.__clinicalSkillsDb) return globalThis.__clinicalSkillsDb;

  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const db = new Database(path.join(DATA_DIR, "app.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    -- Two-level taxonomy: a group holds categories, a category holds courses.
    -- Both levels are optional, so a course can sit in a category with no group,
    -- or in no category at all.
    CREATE TABLE IF NOT EXISTS skill_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      position INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER REFERENCES skill_groups(id) ON DELETE SET NULL,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      position INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS skills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      description TEXT NOT NULL DEFAULT '',
      thumbnail TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS resources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      skill_id INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('pdf', 'image', 'storyboard', 'video')),
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0
    );

    -- Recycle bin. Deleted skills/resources are snapshotted here (payload is a
    -- JSON restore blob) and their uploads are left on disk until the item is
    -- purged, at which point the files listed in "files" are removed too.
    CREATE TABLE IF NOT EXISTS trash (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL CHECK (kind IN ('skill', 'resource', 'thumbnail')),
      label TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      payload TEXT NOT NULL,
      files TEXT NOT NULL DEFAULT '[]',
      deleted_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  migrate(db);
  seedIfEmpty(db);
  globalThis.__clinicalSkillsDb = db;
  return db;
}

/* ------------------------------------------------------------------ */
/* Migrations for databases created by earlier versions.              */
/* ------------------------------------------------------------------ */

function migrate(db: Database.Database) {
  const columns = () =>
    (db.prepare("PRAGMA table_info(skills)").all() as { name: string }[]).map((c) => c.name);
  const skillColumns = columns();

  // Databases created before the thumbnail column existed.
  if (!skillColumns.includes("thumbnail")) {
    db.exec("ALTER TABLE skills ADD COLUMN thumbnail TEXT NOT NULL DEFAULT ''");
  }

  // Databases that stored the category as free text on the skill itself.
  if (!skillColumns.includes("category_id")) {
    db.exec(
      "ALTER TABLE skills ADD COLUMN category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL"
    );
  }
  if (skillColumns.includes("category")) migrateCategoryText(db);
}

/**
 * Turns the old free-text `skills.category` into rows in `categories` (left
 * ungrouped — groups are the admin's to arrange), then retires the column.
 */
function migrateCategoryText(db: Database.Database) {
  const names = (
    db.prepare("SELECT DISTINCT category FROM skills WHERE category <> ''").all() as {
      category: string;
    }[]
  ).map((r) => r.category);

  if (names.length > 0) {
    const find = db.prepare("SELECT id FROM categories WHERE name = ? COLLATE NOCASE");
    const insert = db.prepare(
      "INSERT INTO categories (group_id, slug, name, position) VALUES (NULL, ?, ?, ?)"
    );
    const assign = db.prepare("UPDATE skills SET category_id = ? WHERE category = ? COLLATE NOCASE");
    const nextPosition = db.prepare(
      "SELECT COALESCE(MAX(position), -1) + 1 AS p FROM categories WHERE group_id IS NULL"
    );

    db.transaction(() => {
      for (const name of names) {
        const existing = find.get(name) as { id: number } | undefined;
        const id =
          existing?.id ??
          Number(
            insert.run(
              uniqueSlugFor(db, "categories", name),
              name,
              (nextPosition.get() as { p: number }).p
            ).lastInsertRowid
          );
        assign.run(id, name);
      }
    })();
  }

  // The data now lives in `categories`; keeping the column would let stale text
  // reappear. Older SQLite builds can't drop a column — blank it out instead.
  try {
    db.exec("ALTER TABLE skills DROP COLUMN category");
  } catch {
    db.exec("UPDATE skills SET category = ''");
  }
}

/** Slug for `name` that no row in `table` holds yet. */
function uniqueSlugFor(
  db: Database.Database,
  table: "skills" | "categories" | "skill_groups",
  name: string
): string {
  const base = slugify(name);
  const taken = db.prepare(`SELECT id FROM ${table} WHERE slug = ?`);
  let slug = base;
  let n = 2;
  while (taken.get(slug)) slug = `${base}-${n++}`;
  return slug;
}

/* ------------------------------------------------------------------ */
/* Seed data: a few example skills with demo resources so the app     */
/* is explorable on first run. All replaceable via the admin section. */
/* ------------------------------------------------------------------ */

function seedIfEmpty(db: Database.Database) {
  const count = db.prepare("SELECT COUNT(*) AS n FROM skills").get() as { n: number };
  if (count.n > 0) return;

  const storyboardFrames = seedStoryboardFrames();
  const guidePdf = seedPdf("venepuncture-guide.pdf", "Venepuncture: Procedure Guide", [
    "This is a sample seeded document to demonstrate the PDF viewer.",
    "Replace it with your own materials via the admin section.",
    "",
    "1. Confirm patient identity and obtain informed consent.",
    "2. Perform hand hygiene and assemble equipment.",
    "3. Apply the tourniquet and select a suitable vein.",
    "4. Cleanse the site and allow it to dry.",
    "5. Insert the needle at 15-30 degrees, bevel up.",
    "6. Collect samples in the correct order of draw.",
    "7. Release the tourniquet, withdraw and apply pressure.",
    "8. Label samples at the bedside and dispose of sharps safely.",
  ]);
  const blsPdf = seedPdf("bls-algorithm.pdf", "Basic Life Support: Algorithm Summary", [
    "Sample seeded document. Replace via the admin section.",
    "",
    "1. Confirm scene safety.",
    "2. Check for response and normal breathing.",
    "3. Call for help and request a defibrillator.",
    "4. Start chest compressions at 100-120 per minute.",
    "5. Give 30 compressions to 2 ventilations.",
    "6. Attach the AED as soon as it arrives and follow prompts.",
  ]);
  const vitalsImage = seedVitalsImage();

  // A starter taxonomy: two groups, each holding a couple of categories.
  const insertGroup = db.prepare(
    "INSERT INTO skill_groups (slug, name, description, position) VALUES (?, ?, ?, ?)"
  );
  const insertCategory = db.prepare(
    "INSERT INTO categories (group_id, slug, name, position) VALUES (?, ?, ?, ?)"
  );
  const seedGroup = (name: string, description: string, position: number) =>
    Number(insertGroup.run(slugify(name), name, description, position).lastInsertRowid);
  const seedCategory = (name: string, groupId: number, position: number) =>
    Number(insertCategory.run(groupId, slugify(name), name, position).lastInsertRowid);

  const coreSkills = seedGroup(
    "Core clinical skills",
    "Everyday procedures and assessments practised in the skills lab.",
    0
  );
  const emergencyCare = seedGroup(
    "Emergency care",
    "Recognising and responding to the acutely unwell patient.",
    1
  );
  const categoryIds: Record<string, number> = {
    Procedures: seedCategory("Procedures", coreSkills, 0),
    Assessment: seedCategory("Assessment", coreSkills, 1),
    Emergency: seedCategory("Emergency", emergencyCare, 0),
  };

  const insertSkill = db.prepare(
    "INSERT INTO skills (slug, title, category_id, description, thumbnail) VALUES (?, ?, ?, ?, ?)"
  );
  const insertResource = db.prepare(
    "INSERT INTO resources (skill_id, type, title, content, position) VALUES (?, ?, ?, ?, ?)"
  );
  const seed = (
    slug: string,
    title: string,
    category: string,
    description: string,
    initials: string
  ) =>
    insertSkill.run(
      slug,
      title,
      categoryIds[category] ?? null,
      description,
      seedThumbnail(slug, category, initials)
    ).lastInsertRowid;

  const venepuncture = seed(
    "venepuncture",
    "Venepuncture",
    "Procedures",
    "Safe collection of venous blood samples, including patient preparation, vein selection, order of draw and post-procedure care.",
    "Ve"
  );
  insertResource.run(venepuncture, "video", "Demonstration video", "https://vimeo.com/76979871", 0);
  insertResource.run(venepuncture, "storyboard", "Step-by-step storyboard", JSON.stringify(storyboardFrames), 1);
  insertResource.run(venepuncture, "pdf", "Procedure guide (PDF)", guidePdf, 2);

  const cannulation = seed(
    "peripheral-iv-cannulation",
    "Peripheral IV Cannulation",
    "Procedures",
    "Insertion of a peripheral intravenous cannula: site selection, aseptic technique, securing the device and documentation.",
    "IV"
  );
  insertResource.run(cannulation, "video", "Demonstration video", "https://vimeo.com/76979871", 0);

  const bls = seed(
    "basic-life-support",
    "Basic Life Support",
    "Emergency",
    "Adult basic life support: recognising cardiac arrest, high-quality chest compressions, rescue breaths and safe defibrillator use.",
    "BLS"
  );
  insertResource.run(bls, "pdf", "Algorithm summary (PDF)", blsPdf, 0);

  const vitals = seed(
    "vital-signs-measurement",
    "Vital Signs Measurement",
    "Assessment",
    "Accurate measurement and interpretation of temperature, pulse, respiratory rate, blood pressure and oxygen saturation.",
    "VS"
  );
  insertResource.run(vitals, "image", "Equipment overview", vitalsImage, 0);

  seed(
    "urinary-catheterisation",
    "Urinary Catheterisation",
    "Procedures",
    "Aseptic insertion of a urethral catheter, including consent, positioning, catheter selection and ongoing care.",
    "UC"
  );

  seed(
    "wound-assessment-dressing",
    "Wound Assessment & Dressing",
    "Assessment",
    "Systematic wound assessment, dressing selection and aseptic dressing technique for acute and chronic wounds.",
    "WA"
  );
}

const THUMBNAIL_PALETTES: Record<string, { bg: string; shape: string; accent: string }> = {
  Procedures: { bg: "#ccfbf1", shape: "#99f6e4", accent: "#0f766e" },
  Emergency: { bg: "#ffe4e6", shape: "#fecdd3", accent: "#be123c" },
  Assessment: { bg: "#e0f2fe", shape: "#bae6fd", accent: "#0369a1" },
};

function seedThumbnail(slug: string, category: string, initials: string): string {
  const palette = THUMBNAIL_PALETTES[category] ?? THUMBNAIL_PALETTES.Procedures;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450">
  <rect width="800" height="450" fill="${palette.bg}"/>
  <circle cx="660" cy="60" r="180" fill="${palette.shape}"/>
  <circle cx="90" cy="420" r="130" fill="${palette.shape}"/>
  <circle cx="400" cy="225" r="110" fill="${palette.accent}"/>
  <text x="400" y="252" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="76" font-weight="bold" fill="#ffffff">${initials}</text>
</svg>`;
  return saveSeedFile(`seed-thumb-${slug}.svg`, svg);
}

function saveSeedFile(name: string, data: Buffer | string): string {
  fs.writeFileSync(path.join(UPLOADS_DIR, name), data);
  return `/files/${name}`;
}

function seedStoryboardFrames(): { src: string; caption: string }[] {
  const steps = [
    ["1", "Prepare", "Confirm identity, gain consent and perform hand hygiene"],
    ["2", "Tourniquet", "Apply the tourniquet and palpate to select a vein"],
    ["3", "Cleanse", "Clean the site for 30 seconds and allow to dry"],
    ["4", "Insert", "Insert the needle at 15–30° with the bevel up"],
    ["5", "Collect", "Draw samples following the correct order of draw"],
    ["6", "Complete", "Release, withdraw, apply pressure and label samples"],
  ];
  return steps.map(([n, title, caption], i) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500">
  <rect width="800" height="500" fill="#f0fdfa"/>
  <rect x="24" y="24" width="752" height="452" rx="16" fill="#ffffff" stroke="#99f6e4" stroke-width="2"/>
  <circle cx="120" cy="180" r="56" fill="#0d9488"/>
  <text x="120" y="202" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="60" font-weight="bold" fill="#ffffff">${n}</text>
  <text x="64" y="330" font-family="Helvetica, Arial, sans-serif" font-size="42" font-weight="bold" fill="#134e4a">${title}</text>
  <text x="64" y="440" font-family="Helvetica, Arial, sans-serif" font-size="16" fill="#a8a29e">Sample storyboard frame — replace via the admin section</text>
</svg>`;
    return { src: saveSeedFile(`seed-venepuncture-step-${i + 1}.svg`, svg), caption };
  });
}

function seedVitalsImage(): string {
  const items = [
    ["Thermometer", "Temperature"],
    ["Watch / monitor", "Pulse & respirations"],
    ["Sphygmomanometer", "Blood pressure"],
    ["Pulse oximeter", "Oxygen saturation"],
  ];
  const boxes = items
    .map(([name, use], i) => {
      const x = 60 + (i % 2) * 350;
      const y = 130 + Math.floor(i / 2) * 160;
      return `<rect x="${x}" y="${y}" width="310" height="120" rx="12" fill="#ffffff" stroke="#99f6e4" stroke-width="2"/>
  <text x="${x + 24}" y="${y + 52}" font-family="Helvetica, Arial, sans-serif" font-size="24" font-weight="bold" fill="#134e4a">${name}</text>
  <text x="${x + 24}" y="${y + 86}" font-family="Helvetica, Arial, sans-serif" font-size="18" fill="#57534e">${use}</text>`;
    })
    .join("\n  ");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="780" height="480" viewBox="0 0 780 480">
  <rect width="780" height="480" fill="#f0fdfa"/>
  <text x="60" y="80" font-family="Helvetica, Arial, sans-serif" font-size="32" font-weight="bold" fill="#134e4a">Vital signs equipment</text>
  ${boxes}
  <text x="60" y="450" font-family="Helvetica, Arial, sans-serif" font-size="15" fill="#a8a29e">Sample image — replace via the admin section</text>
</svg>`;
  return saveSeedFile("seed-vitals-equipment.svg", svg);
}

/** Builds a minimal but valid one-page PDF with the given title and lines. */
function seedPdf(name: string, title: string, lines: string[]): string {
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  let text = `BT /F1 20 Tf 72 720 Td (${esc(title)}) Tj ET\n`;
  lines.forEach((line, i) => {
    text += `BT /F1 12 Tf 72 ${680 - i * 22} Td (${esc(line)}) Tj ET\n`;
  });

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((o) => {
    pdf += `${String(o).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return saveSeedFile(name, Buffer.from(pdf, "latin1"));
}
