export interface Group {
  id: number;
  slug: string;
  name: string;
  description: string;
  position: number;
}

export interface Category {
  id: number;
  group_id: number | null;
  slug: string;
  name: string;
  description: string;
  position: number;
}

export interface Skill {
  id: number;
  slug: string;
  title: string;
  category_id: number | null;
  description: string;
  thumbnail_asset: string | null;
  created_at: string;
}

export interface Resource {
  id: number;
  skill_id: number;
  type: string;
  title: string;
  content: string;
  asset: string | null;
  requires_internet: number;
  position: number;
}

export interface StoryboardFrame {
  id: number;
  resource_id: number;
  position: number;
  asset: string;
  alt: string;
  caption: string;
}

export interface MediaItem {
  id: number;
  filename: string;
  title: string;
  alt: string;
  kind: string;
  mime: string;
  bytes: number;
  asset: string;
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
  assets: {
    media_id: number;
    path: string;
    mime: string;
    bytes: number;
    sha256: string;
  }[];
  total_uncompressed_bytes: number;
  counts: {
    groups: number;
    categories: number;
    skills: number;
    resources: number;
    assets: number;
  };
  min_app_content_schema_version: number;
}

export interface ReleaseInfo {
  id: string;
  version: string;
  createdAt: string;
  counts: ReleaseManifest["counts"];
}
