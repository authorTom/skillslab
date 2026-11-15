// Snapshots the database, uploaded files and offline releases.
//
//   npm run backup                                       (from source)
//   docker compose exec app node scripts/backup.mjs      (container)
//
// Safe to run while the app is serving: the database is copied with SQLite's
// online backup API, which is consistent even mid-write in WAL mode. Copying
// app.db by hand (or tarring the live volume) is not.
//
// Environment:
//   BACKUP_DIR    where snapshots go (default: backups/ beside data/)
//   BACKUP_KEEP   how many snapshots to keep (default: 14)
//
// Restore one with scripts/restore.mjs.

import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import {
  DATA_DIR,
  DATA_FOLDERS,
  DB_FILE,
  MANIFEST,
  backupsDir,
  copyFolder,
  countFiles,
  integrityCheck,
  listSnapshots,
  timestamp,
} from "./snapshots.mjs";

const keep = Number(process.env.BACKUP_KEEP || 14);
if (!Number.isInteger(keep) || keep < 1) {
  console.error(`BACKUP_KEEP must be a whole number of at least 1, not "${process.env.BACKUP_KEEP}".`);
  process.exit(1);
}

const dbPath = path.join(DATA_DIR, DB_FILE);
if (!fs.existsSync(dbPath)) {
  console.error(`No database found at ${dbPath}, so there is nothing to back up.`);
  process.exit(1);
}

const dir = backupsDir();
const name = timestamp();
const dest = path.join(dir, name);
// Built under a temporary name and renamed when complete, so an interrupted
// backup never looks like a snapshot that could be restored.
const partial = `${dest}.partial`;
fs.rmSync(partial, { recursive: true, force: true });
fs.mkdirSync(partial, { recursive: true });

try {
  const db = new Database(dbPath, { readonly: true });
  try {
    await db.backup(path.join(partial, DB_FILE));
  } finally {
    db.close();
  }
  // The copy inherits WAL mode; make it one self-contained file.
  const copy = new Database(path.join(partial, DB_FILE));
  copy.pragma("journal_mode = DELETE");
  copy.close();
  const check = integrityCheck(path.join(partial, DB_FILE));
  if (check !== "ok") throw new Error(`The copied database failed its integrity check: ${check}`);

  const counts = {};
  for (const folder of DATA_FOLDERS) {
    const source = path.join(DATA_DIR, folder);
    if (fs.existsSync(source)) copyFolder(source, path.join(partial, folder));
    counts[folder] = countFiles(path.join(partial, folder));
  }

  fs.writeFileSync(
    path.join(partial, MANIFEST),
    JSON.stringify({ created_at: new Date().toISOString(), files: counts }, null, 2) + "\n"
  );
  if (fs.existsSync(dest)) throw new Error(`${dest} already exists.`);
  fs.renameSync(partial, dest);

  const snapshots = listSnapshots(dir);
  for (const old of snapshots.slice(0, Math.max(0, snapshots.length - keep))) {
    fs.rmSync(path.join(dir, old), { recursive: true, force: true });
  }

  console.log(
    `Backed up the database, ${counts.uploads} uploaded files and ${counts.releases} release files to ${dest}`
  );
  console.log(`Keeping the ${Math.min(snapshots.length, keep)} most recent snapshots in ${dir}.`);
} catch (error) {
  fs.rmSync(partial, { recursive: true, force: true });
  console.error(`Backup failed: ${error.message}`);
  process.exit(1);
}
