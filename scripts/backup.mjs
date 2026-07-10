// Snapshots the SQLite database and uploaded files into backups/<timestamp>/.
// Uses SQLite's online backup API, so it's safe to run while the app is serving.
// Usage: npm run backup   (keeps the most recent 14 snapshots)

import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const KEEP = 14;

const root = process.cwd();
const dataDir = path.join(root, "data");
const dbPath = path.join(dataDir, "app.db");
const uploadsDir = path.join(dataDir, "uploads");
const backupsDir = path.join(root, "backups");

if (!fs.existsSync(dbPath)) {
  console.error(`No database found at ${dbPath} — nothing to back up.`);
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/:/g, "-").replace(/\..+/, "");
const dest = path.join(backupsDir, stamp);
fs.mkdirSync(dest, { recursive: true });

const db = new Database(dbPath, { readonly: true });
await db.backup(path.join(dest, "app.db"));
db.close();

if (fs.existsSync(uploadsDir)) {
  fs.cpSync(uploadsDir, path.join(dest, "uploads"), { recursive: true });
}

const snapshots = fs
  .readdirSync(backupsDir)
  .filter((name) => fs.statSync(path.join(backupsDir, name)).isDirectory())
  .sort();
for (const old of snapshots.slice(0, Math.max(0, snapshots.length - KEEP))) {
  fs.rmSync(path.join(backupsDir, old), { recursive: true, force: true });
}

const fileCount = fs.existsSync(uploadsDir) ? fs.readdirSync(uploadsDir).length : 0;
console.log(`Backed up database + ${fileCount} uploaded files to ${dest}`);
console.log(`Keeping the ${Math.min(snapshots.length, KEEP)} most recent snapshots.`);
