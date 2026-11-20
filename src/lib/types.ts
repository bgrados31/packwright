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
  icon: string | null;
  banner: string | null;
};

export type AppConfig = {
  workspace: string;
  packwiz_path: string | null;
  serve_port: number;
  locale: string;
  atlauncher_path: string | null;
  java_path: string | null;
  setup_complete: boolean;
  default_loader: string;
  launchers: string[];
  launcher_paths: Record<string, string>;
  editor_font_size: number;
  editor_tab_size: number;
  editor_minimap: boolean;
  editor_word_wrap: boolean;
  editor_roots: string[];
  debug_console: boolean;
  modrinth_token: string;
  modrinth_project_id: string;
};

export type PackwizStatus = { found: boolean; path: string | null };

export type ModpackHit = {
  id: string;
  slug: string;
  title: string;
  description: string;
  icon_url: string;
  downloads: number;
};

export type ExportValidation = {
  ok: boolean;
  issues: string[];
};

export type ExportResult = {
  path: string;
  name: string;
  size: number;
  output_dir: string;
};

export type OpLine = {
  id: string;
  stream: "stdout" | "stderr";
  line: string;
};

export type ErrorInfo = { message: string; kind: string };

export type FileEntry = { path: string; name: string; size: number };

export type TreeNode = {
  path: string;
  name: string;
  kind: "dir" | "file";
  children: TreeNode[];
  size: number;
};

export type OpenFile = {
  key: string;
  root: string;
  path: string;
  name: string;
  content: string;
  saved: string;
  diagnostics: Diagnostic[];
};

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
  loaders: string[];
};

export type LoaderVersion = { id: string; stable: boolean };
export type ServerVersion = { id: string; stable: boolean };
export type JavaInfo = { path: string; found: boolean };

export type ModSearchHit = {
  project_id: string;
  slug: string;
  name: string;
  description: string;
  icon_url: string | null;
  downloads: number;
  follows: number;
  author: string;
  date_modified: string;
  featured_gallery: string | null;
  gallery: string[];
  client_side: string;
  server_side: string;
  categories: string[];
};

export type ModSearchResult = {
  hits: ModSearchHit[];
  total: number;
  limit: number;
  offset: number;
};

export type ModCategory = {
  name: string;
  header: string;
  project_type: string;
};

export type ModProject = {
  name: string;
  description: string;
  body: string;
  icon_url: string | null;
  gallery: string[];
  author: string;
  downloads: number;
  followers: number;
  categories: string[];
  client_side: string;
  server_side: string;
  license: string;
  source_url: string | null;
  issues_url: string | null;
  website_url: string | null;
};

export type ModVersion = {
  id: string;
  name: string;
  version_number: string;
  game_versions: string[];
  loaders: string[];
  release_type: string;
  date_published: string;
};

export type InstalledMod = {
  id: string;
  name: string;
  filename: string;
  side: string;
  optional: boolean;
  pinned: boolean;
  project_id: string | null;
  version_id: string | null;
  source: string;
};

export type ModDep = {
  project_id: string;
  name: string;
  version_id: string | null;
  kind: string;
  installed: boolean;
  installed_version: string | null;
};

export type ModAnalysis = {
  ok: boolean;
  duplicate: boolean;
  dependencies: ModDep[];
  missing_required: ModDep[];
  conflicts: ModDep[];
  checked: number;
};

export type ServerInfo = {
  name: string;
  template: string;
  version: string;
  port: number;
  jar: string;
  java: string;
  memory?: number;
  path: string;
  running: boolean;
};

export type ServerPlayers = {
  ops: string[];
  whitelist: string[];
  banned: string[];
};

export type ServerStats = {
  running: boolean;
  uptime_secs: number;
  plugins: number;
  mods: number;
  backups: number;
  jar_exists: boolean;
  eula: boolean;
  world_size: number;
  total_size: number;
  issues: string[];
};

export type ServerFileEntry = {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
};

export type PlayerEvent = {
  time: string;
  name: string;
  kind: string;
};

export type ServerActivity = {
  online: string[];
  events: PlayerEvent[];
};

export type ModHistoryItem = {
  id: string;
  name: string;
  version: string | null;
};

export type ModHistoryEntry = {
  id: string;
  at: number;
  action: string;
  ok: boolean;
  main: ModHistoryItem[];
  dependencies: ModHistoryItem[];
  output: string[];
};

export type ModHealth = {
  duplicates: string[];
  unmanaged: number;
  pinned: number;
  total: number;
};

export type ModOperation = {
  kind: "add" | "remove" | "pin" | "unpin" | "update" | "refresh";
  label: string;
  dir: string;
  projectId?: string;
  versionId?: string;
  name?: string;
  names?: string[];
  modName?: string;
};

export type PackMeta = {
  summary: string;
  license: string;
  homepage: string;
  source: string;
  categories: string[];
  icon: string;
  banner: string;
  gallery: string[];
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
