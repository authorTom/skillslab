// Restores a snapshot made by backup.mjs into data/.
//
//   node scripts/restore.mjs                  list the snapshots in BACKUP_DIR
//   node scripts/restore.mjs <snapshot>       restore one (a name from the list,
//                                             or a path to a snapshot folder)
//   node scripts/restore.mjs <snapshot> --force
//                                             restore even though the app has
//                                             the database open (restart it
//                                             straight after)
//
// Stop the app first. In a container deployment:
//
//   docker compose stop app
//   docker compose run --rm --no-deps app node scripts/restore.mjs <snapshot>
//   docker compose start app
//
// What is in data/ now is not deleted: the database, uploads and releases are
// moved aside to data/.pre-restore-<timestamp>/, to delete once you are happy.

import fs from "fs";
import path from "path";
import {
  DATA_DIR,
  DATA_FOLDERS,
  DB_FILE,
  MANIFEST,
  backupsDir,
  copyFolder,
  databaseInUse,
  integrityCheck,
  listSnapshots,
  timestamp,
} from "./snapshots.mjs";

const args = process.argv.slice(2);
const force = args.includes("--force");
const target = args.find((arg) => !arg.startsWith("--"));

if (!target) {
  const snapshots = listSnapshots();
  if (snapshots.length === 0) {
    console.log(`No snapshots in ${backupsDir()}.`);
  } else {
    console.log(`Snapshots in ${backupsDir()}, newest last:\n`);
    for (const name of snapshots) console.log(`  ${name}`);
    console.log("\nRestore one with: node scripts/restore.mjs <snapshot>");
  }
  process.exit(0);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

// A bare name is looked up in BACKUP_DIR; anything else is taken as a path.
const source = target.includes(path.sep) ? path.resolve(target) : path.join(backupsDir(), target);
if (!fs.existsSync(path.join(source, MANIFEST)) || !fs.existsSync(path.join(source, DB_FILE))) {
  fail(`${source} is not a complete snapshot (it needs ${DB_FILE} and ${MANIFEST}).`);
}
const check = integrityCheck(path.join(source, DB_FILE));
if (check !== "ok") fail(`The snapshot's database failed its integrity check: ${check}`);

const dbPath = path.join(DATA_DIR, DB_FILE);
if (databaseInUse(dbPath)) {
  if (!force) {
    fail(
      "The app has the database open. Stop it first (docker compose stop app), " +
        "then restore with: docker compose run --rm --no-deps app node scripts/restore.mjs " +
        `${target}\nOr pass --force to restore anyway and restart the app straight after.`
    );
  }
  console.warn("The app has the database open; restoring anyway (--force). Restart it now.");
}

// Move what is there aside rather than deleting it.
fs.mkdirSync(DATA_DIR, { recursive: true });
let aside = path.join(DATA_DIR, `.pre-restore-${timestamp()}`);
for (let n = 2; fs.existsSync(aside); n++) aside = path.join(DATA_DIR, `.pre-restore-${timestamp()}-${n}`);
const current = [DB_FILE, `${DB_FILE}-wal`, `${DB_FILE}-shm`, ...DATA_FOLDERS].filter((name) =>
  fs.existsSync(path.join(DATA_DIR, name))
);
if (current.length > 0) {
  fs.mkdirSync(aside);
  for (const name of current) fs.renameSync(path.join(DATA_DIR, name), path.join(aside, name));
}

try {
  // Copy under a temporary name first, so data/ never holds half a database.
  const incoming = path.join(DATA_DIR, `${DB_FILE}.restoring`);
  fs.copyFileSync(path.join(source, DB_FILE), incoming);
  fs.renameSync(incoming, dbPath);
  for (const folder of DATA_FOLDERS) {
    const from = path.join(source, folder);
    if (fs.existsSync(from)) copyFolder(from, path.join(DATA_DIR, folder));
  }
} catch (error) {
  console.error(`Restore failed: ${error.message}`);
  if (current.length > 0) console.error(`What was in data/ before is in ${aside}.`);
  process.exit(1);
}

console.log(`Restored ${path.basename(source)} into ${DATA_DIR}.`);
if (current.length > 0) {
  console.log(`What was there before is in ${aside}; delete it once you are happy.`);
}
