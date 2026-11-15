// Shared by backup.mjs and restore.mjs: where data and snapshots live, and
// what a complete snapshot looks like.
//
// A snapshot is a folder named by its UTC timestamp, holding
//   app.db          a consistent copy made with SQLite's online backup API
//   uploads/        the media library's files
//   releases/       built offline content releases (and .current)
//   snapshot.json   written last; a folder without it is incomplete
//
// Both scripts work on data/ under the current directory, as the app does.

import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

export const DATA_DIR = path.join(process.cwd(), "data");
export const DB_FILE = "app.db";
/** Folders under data/ that a snapshot carries alongside the database. */
export const DATA_FOLDERS = ["uploads", "releases"];
export const MANIFEST = "snapshot.json";

/** BACKUP_DIR, or backups/ beside data/. */
export function backupsDir() {
  return path.resolve(process.env.BACKUP_DIR || path.join(process.cwd(), "backups"));
}

/** Complete snapshots in the backups folder, oldest first. */
export function listSnapshots(dir = backupsDir()) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(dir, entry.name, MANIFEST)))
    .map((entry) => entry.name)
    .sort();
}

/** The database's own integrity check: "ok", or the first problem it found. */
export function integrityCheck(file) {
  const db = new Database(file, { readonly: true, fileMustExist: true });
  try {
    return db.pragma("integrity_check", { simple: true });
  } finally {
    db.close();
  }
}

/**
 * True when another process has the database open (the app holds it open for
 * as long as it runs). In WAL mode every open connection keeps a shared lock,
 * so an exclusive one can only be had when nobody else is connected.
 */
export function databaseInUse(file) {
  if (!fs.existsSync(file)) return false;
  const db = new Database(file, { fileMustExist: true, timeout: 0 });
  try {
    db.pragma("locking_mode = EXCLUSIVE");
    db.exec("BEGIN EXCLUSIVE; COMMIT");
    return false;
  } catch (error) {
    if (error.code === "SQLITE_BUSY" || error.code === "SQLITE_LOCKED") return true;
    throw error;
  } finally {
    db.close();
  }
}

/** Copies a folder, leaving out half-built release staging folders. */
export function copyFolder(from, to) {
  fs.cpSync(from, to, {
    recursive: true,
    filter: (source) => !path.basename(source).startsWith(".staging-"),
  });
}

export function countFiles(dir) {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).length;
}

export function timestamp(date = new Date()) {
  return date.toISOString().replace(/:/g, "-").replace(/\..+/, "");
}
