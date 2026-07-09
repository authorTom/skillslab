import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

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
    CREATE TABLE IF NOT EXISTS skills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
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
  `);

  seedIfEmpty(db);
  globalThis.__clinicalSkillsDb = db;
  return db;
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

  const insertSkill = db.prepare(
    "INSERT INTO skills (slug, title, category, description) VALUES (?, ?, ?, ?)"
  );
  const insertResource = db.prepare(
    "INSERT INTO resources (skill_id, type, title, content, position) VALUES (?, ?, ?, ?, ?)"
  );

  const venepuncture = insertSkill.run(
    "venepuncture",
    "Venepuncture",
    "Procedures",
    "Safe collection of venous blood samples, including patient preparation, vein selection, order of draw and post-procedure care."
  ).lastInsertRowid;
  insertResource.run(venepuncture, "video", "Demonstration video", "https://vimeo.com/76979871", 0);
  insertResource.run(venepuncture, "storyboard", "Step-by-step storyboard", JSON.stringify(storyboardFrames), 1);
  insertResource.run(venepuncture, "pdf", "Procedure guide (PDF)", guidePdf, 2);

  const cannulation = insertSkill.run(
    "peripheral-iv-cannulation",
    "Peripheral IV Cannulation",
    "Procedures",
    "Insertion of a peripheral intravenous cannula: site selection, aseptic technique, securing the device and documentation."
  ).lastInsertRowid;
  insertResource.run(cannulation, "video", "Demonstration video", "https://vimeo.com/76979871", 0);

  const bls = insertSkill.run(
    "basic-life-support",
    "Basic Life Support",
    "Emergency",
    "Adult basic life support: recognising cardiac arrest, high-quality chest compressions, rescue breaths and safe defibrillator use."
  ).lastInsertRowid;
  insertResource.run(bls, "pdf", "Algorithm summary (PDF)", blsPdf, 0);

  const vitals = insertSkill.run(
    "vital-signs-measurement",
    "Vital Signs Measurement",
    "Assessment",
    "Accurate measurement and interpretation of temperature, pulse, respiratory rate, blood pressure and oxygen saturation."
  ).lastInsertRowid;
  insertResource.run(vitals, "image", "Equipment overview", vitalsImage, 0);

  insertSkill.run(
    "urinary-catheterisation",
    "Urinary Catheterisation",
    "Procedures",
    "Aseptic insertion of a urethral catheter, including consent, positioning, catheter selection and ongoing care."
  );

  insertSkill.run(
    "wound-assessment-dressing",
    "Wound Assessment & Dressing",
    "Assessment",
    "Systematic wound assessment, dressing selection and aseptic dressing technique for acute and chronic wounds."
  );
}

function saveSeedFile(name: string, data: Buffer | string): string {
  fs.writeFileSync(path.join(UPLOADS_DIR, name), data);
  return `/files/${name}`;
}

function seedStoryboardFrames(): string[] {
  const steps = [
    ["1", "Prepare", "Confirm identity, gain consent, perform hand hygiene"],
    ["2", "Tourniquet", "Apply tourniquet and palpate to select a vein"],
    ["3", "Cleanse", "Clean the site for 30 seconds and allow to dry"],
    ["4", "Insert", "Insert needle at 15–30° with the bevel up"],
    ["5", "Collect", "Draw samples following the correct order of draw"],
    ["6", "Complete", "Release, withdraw, apply pressure and label samples"],
  ];
  return steps.map(([n, title, caption], i) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500">
  <rect width="800" height="500" fill="#f0fdfa"/>
  <rect x="24" y="24" width="752" height="452" rx="16" fill="#ffffff" stroke="#99f6e4" stroke-width="2"/>
  <circle cx="120" cy="160" r="56" fill="#0d9488"/>
  <text x="120" y="182" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="60" font-weight="bold" fill="#ffffff">${n}</text>
  <text x="64" y="300" font-family="Helvetica, Arial, sans-serif" font-size="42" font-weight="bold" fill="#134e4a">${title}</text>
  <text x="64" y="352" font-family="Helvetica, Arial, sans-serif" font-size="22" fill="#57534e">${caption}</text>
  <text x="64" y="440" font-family="Helvetica, Arial, sans-serif" font-size="16" fill="#a8a29e">Sample storyboard frame — replace via the admin section</text>
</svg>`;
    return saveSeedFile(`seed-venepuncture-step-${i + 1}.svg`, svg);
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
