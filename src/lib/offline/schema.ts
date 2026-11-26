/**
 * Content schema version for the offline reader database.
 *
 * Bump it only for a change an older app can't read: apps refuse releases
 * newer than they know. Additive changes stay at 1. The key-point columns on
 * `skills` and `resources.chapters` were added that way: older apps select
 * `*` and ignore them, and newer apps treat them as empty when a release
 * built before them is installed.
 */
export const CONTENT_SCHEMA_VERSION = 1;

/** Package format identifier. */
export const PACKAGE_FORMAT = "skillslab-content";

/** Package schema version. */
export const PACKAGE_SCHEMA_VERSION = 1;

/** SQL to create the reader catalogue database tables. */
export const READER_SCHEMA_SQL = `
  CREATE TABLE metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE groups (
    id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE categories (
    id INTEGER PRIMARY KEY,
    group_id INTEGER REFERENCES groups(id),
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE skills (
    id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    category_id INTEGER REFERENCES categories(id),
    description TEXT NOT NULL DEFAULT '',
    thumbnail_asset TEXT,
    created_at TEXT NOT NULL,
    indications TEXT NOT NULL DEFAULT '',
    contraindications TEXT NOT NULL DEFAULT '',
    equipment TEXT NOT NULL DEFAULT '',
    red_flags TEXT NOT NULL DEFAULT '',
    common_errors TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE resources (
    id INTEGER PRIMARY KEY,
    skill_id INTEGER NOT NULL REFERENCES skills(id),
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    asset TEXT,
    requires_internet INTEGER NOT NULL DEFAULT 0,
    position INTEGER NOT NULL DEFAULT 0,
    -- JSON array of {time, title}, seconds from the start. Local videos only.
    chapters TEXT NOT NULL DEFAULT '[]'
  );

  CREATE TABLE storyboard_frames (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    resource_id INTEGER NOT NULL REFERENCES resources(id),
    position INTEGER NOT NULL,
    asset TEXT NOT NULL,
    alt TEXT NOT NULL DEFAULT '',
    caption TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE media (
    id INTEGER PRIMARY KEY,
    filename TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    alt TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL,
    mime TEXT NOT NULL,
    bytes INTEGER NOT NULL DEFAULT 0,
    asset TEXT NOT NULL
  );
`;

export interface ManifestAsset {
  media_id: number;
  path: string;
  mime: string;
  bytes: number;
  sha256: string;
}

export interface ReleaseManifest {
  format: string;
  package_schema_version: number;
  content_schema_version: number;
  release_id: string;
  release_version: string;
  created_at: string;
  catalogue: {
    filename: string;
    bytes: number;
    sha256: string;
  };
  assets: ManifestAsset[];
  total_uncompressed_bytes: number;
  counts: {
    groups: number;
    categories: number;
    skills: number;
    resources: number;
    assets: number;
  };
  /**
   * Base64 Ed25519 signature over signingPayload() in ./signing.mjs. Present
   * when the server had a signing key as the release was built.
   */
  signature?: string;
  min_app_content_schema_version: number;
}

export type VimeoPolicy = "strict" | "permissive";
