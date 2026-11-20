export type PackInfo = {
  dir: string;
  path: string;
  name: string;
  author: string | null;
  version: string | null;
  description: string | null;
  minecraft_version: string | null;
  loader: string | null;
  loader_version: string | null;
  mod_count: number;
  issues: string[];
};

export type AppConfig = {
  workspace: string;
  packwiz_path: string | null;
  serve_port: number;
  locale: string;
  atlauncher_path: string | null;
};

export type PackwizStatus = { found: boolean; path: string | null };

export type OpLine = {
  id: string;
  stream: "stdout" | "stderr";
  line: string;
};

export type ErrorInfo = { message: string; kind: string };

export type FileEntry = { path: string; name: string; size: number };

export type Diagnostic = {
  line: number;
  column: number;
  message: string;
  severity: string;
};

export type HistoryEntry = { id: string; path: string };

export type McVersion = {
  id: string;
  kind: string;
  release_time: string;
  latest: boolean;
};

export type LoaderVersion = { id: string; stable: boolean };

export type PackMeta = {
  summary: string;
  license: string;
  homepage: string;
  source: string;
  categories: string[];
  icon: string;
  banner: string;
  readme: string;
};

export const LOADERS = ["neoforge", "forge", "fabric", "quilt", "purpur"] as const;
export type Loader = (typeof LOADERS)[number];

export type CreatePackInput = {
  name: string;
  author: string;
  minecraft_version: string;
  loader: string;
  loaderVersion: string | null;
  version: string;
  description: string;
};
