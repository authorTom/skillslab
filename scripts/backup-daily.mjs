// Runs scripts/backup.mjs once a day, for the `backups` service in
// compose.yaml, so nightly snapshots don't depend on a cron job on the host.
//
//   node scripts/backup-daily.mjs
//
// Environment:
//   BACKUP_TIME   when to back up each day, as HH:MM in the container's time
//                 zone (TZ; UTC unless set). Default 02:00.
//   BACKUP_DIR, BACKUP_KEEP   passed through to backup.mjs.
//
// Each backup runs as its own process, so one that fails is logged and the
// next night's still runs. This script only stops when told to, or at once
// if BACKUP_TIME is invalid.

import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

/** "HH:MM" (24-hour) as { hour, minute }, or null if it isn't one. */
export function parseBackupTime(value) {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(value).trim());
  return match ? { hour: Number(match[1]), minute: Number(match[2]) } : null;
}

/** Milliseconds from `now` until the next HH:MM in local time (never 0). */
export function msUntilNext({ hour, minute }, now = new Date()) {
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

function runBackup() {
  const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "backup.mjs");
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script], { stdio: "inherit" });
    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", (error) => {
      console.error(`Couldn't start the backup: ${error.message}`);
      resolve(1);
    });
  });
}

async function main() {
  const setting = process.env.BACKUP_TIME || "02:00";
  const time = parseBackupTime(setting);
  if (!time) {
    console.error(`BACKUP_TIME must be a time of day like 02:00, not "${setting}".`);
    process.exit(1);
  }
  // The container's init forwards `docker compose stop` as SIGTERM.
  process.on("SIGTERM", () => process.exit(0));

  for (;;) {
    const wait = msUntilNext(time);
    console.log(`Next backup at ${new Date(Date.now() + wait).toString()}.`);
    await new Promise((resolve) => setTimeout(resolve, wait));
    const code = await runBackup();
    if (code !== 0) console.error(`The backup failed (exit code ${code}); trying again tomorrow.`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
