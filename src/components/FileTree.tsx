import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  FileCode2,
  FileJson2,
  FilePlus2,
  FileText,
  Folder,
  FolderOpen,
  FolderTree,
  Package,
  Pencil,
  Search,
  Settings2,
  Trash2,
} from "lucide-react";
import { useI18n } from "../i18n";
import type { TreeNode } from "../lib/types";
import { ContextMenu, type ContextMenuItem } from "./ui";

type Props = {
  dir: string;
  roots: string[];
  allRoots: string[];
  activeKey: string | null;
  revision: number;
  onOpen: (root: string, path: string, name: string) => void;
  onToggleRoot: (root: string) => void;
  onRename: (root: string, path: string, name: string) => void;
  onDelete: (root: string, path: string) => void;
  onNewFile: (root: string, parent: string, name: string) => void;
};

const isProtected = (path: string): boolean => {
  const value = path.replace(/\\/g, "/");
  return (
    value === "pack.toml" ||
    value === "index.toml" ||
    (value.startsWith("mods/") && value.endsWith(".pw.toml")) ||
    value.startsWith(".packwright/")
  );
};

const ROOT_META: Record<string, { labelKey: "editor.root.pack" | "editor.root.packwiz" | "editor.root.packwright"; icon: typeof Folder }> = {
  pack: { labelKey: "editor.root.pack", icon: FolderTree },
  packwiz: { labelKey: "editor.root.packwiz", icon: Package },
  packwright: { labelKey: "editor.root.packwright", icon: FolderTree },
};

function FileIcon({ name }: { name: string }) {
  if (name.endsWith(".json") || name.endsWith(".json5")) return <FileJson2 size={14} className="shrink-0 text-amber-400" />;
  if (name.endsWith(".toml")) return <FileCode2 size={14} className="shrink-0 text-orange-400" />;
  if (name.endsWith(".md")) return <FileText size={14} className="shrink-0 text-sky-400" />;
  return <FileText size={14} className="shrink-0 text-muted" />;
}

function filterNodes(nodes: TreeNode[], query: string): TreeNode[] {
  if (!query) return nodes;
  const needle = query.toLowerCase();
  const result: TreeNode[] = [];
  for (const node of nodes) {
    if (node.kind === "file") {
      if (node.name.toLowerCase().includes(needle) || node.path.toLowerCase().includes(needle)) {
        result.push(node);
      }
      continue;
    }
    const children = filterNodes(node.children, query);
    if (children.length > 0 || node.name.toLowerCase().includes(needle)) {
      result.push({ ...node, children });
    }
  }
  return result;
}

export default function FileTree({ dir, roots, allRoots, activeKey, revision, onOpen, onToggleRoot, onRename, onDelete, onNewFile }: Props) {
  const { t } = useI18n();
  const [trees, setTrees] = useState<Record<string, TreeNode[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["pack", "packwiz", "packwright"]));
  const [collapsedRoots, setCollapsedRoots] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; root: string; path: string; name: string; isDir: boolean } | null>(null);
  const [renaming, setRenaming] = useState<{ root: string; path: string; name: string } | null>(null);
  const [creating, setCreating] = useState<{ root: string; parent: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      roots.map(async (root) => {
        const nodes = await invoke<TreeNode[]>("pack_tree", { dir, scope: root }).catch(() => [] as TreeNode[]);
        return [root, nodes] as const;
      }),
    ).then((entries) => {
      if (!cancelled) setTrees(Object.fromEntries(entries));
    });
    return () => { cancelled = true; };
  }, [dir, roots, revision]);

  const toggleDir = (path: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const renderNodes = (nodes: TreeNode[], root: string, depth: number): React.ReactNode =>
    nodes.map((node) => {
      const isDir = node.kind === "dir";
      const isOpen = expanded.has(node.path);
      const isRenaming = renaming?.root === root && renaming.path === node.path;
      if (isRenaming) {
        return (
          <div key={`${root}:${node.path}`} className="px-1.5 py-0.5" style={{ paddingLeft: 8 + depth * 14 }}>
            <input
              autoFocus
              className="field !px-1.5 !py-1 text-[11px]"
              defaultValue={renaming.name}
              onBlur={(event) => {
                const value = event.target.value.trim();
                if (value && value !== renaming.name) onRename(root, node.path, value);
                setRenaming(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
                if (event.key === "Escape") setRenaming(null);
              }}
            />
          </div>
        );
      }
      return (
        <div key={`${root}:${node.path}`}>
          <button
            className={`tree-row ${activeKey === `${root}:${node.path}` ? "active" : ""}`}
            style={{ paddingLeft: 8 + depth * 14 }}
            onClick={() => (isDir ? toggleDir(node.path) : onOpen(root, node.path, node.name))}
            onContextMenu={(event) => {
              event.preventDefault();
              setMenu({ x: event.clientX, y: event.clientY, root, path: node.path, name: node.name, isDir });
            }}
            title={node.path}
          >
            {isDir ? (
              <>
                {isOpen ? <ChevronDown size={12} className="shrink-0 text-muted" /> : <ChevronRight size={12} className="shrink-0 text-muted" />}
                {isOpen ? <FolderOpen size={14} className="shrink-0 text-accent" /> : <Folder size={14} className="shrink-0 text-muted" />}
              </>
            ) : (
              <>
                <span className="w-3 shrink-0" />
                <FileIcon name={node.name} />
              </>
            )}
            <span className="truncate">{node.name}</span>
          </button>
          {isDir && isOpen && renderNodes(node.children, root, depth + 1)}
        </div>
      );
    });

  const filtered = useMemo(() => trees, [trees]);

  return (
    <aside className="file-explorer">
      <div className="file-explorer-head">
        <span className="text-xs font-semibold">{t("editor.explorer")}</span>
        <div className="relative mt-2">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            className="field field-icon py-1.5 text-[11px]"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("editor.filterFiles")}
          />
        </div>
      </div>

      <div className="file-explorer-roots">
        {roots.map((root) => {
          const meta = ROOT_META[root] ?? { labelKey: "editor.root.pack" as const, icon: FolderTree };
          const RootIcon = meta.icon;
          const isCollapsed = collapsedRoots.has(root);
          const nodes = filterNodes(filtered[root] ?? [], query);
          return (
            <div key={root} className="mb-1">
              <div className="tree-root">
                <button
                  className="flex min-w-0 flex-1 items-center gap-1.5"
                  onClick={() =>
                    setCollapsedRoots((current) => {
                      const next = new Set(current);
                      if (next.has(root)) next.delete(root);
                      else next.add(root);
                      return next;
                    })
                  }
                >
                  {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                  <RootIcon size={14} className="text-accent" />
                  <span className="truncate text-[11px] font-semibold uppercase tracking-wide">{t(meta.labelKey)}</span>
                </button>
                <button className="icon-btn !h-5 !w-5" onClick={() => setSettingsOpen((value) => !value)} title={t("editor.rootSettings")}>
                  <Settings2 size={12} />
                </button>
              </div>
              {settingsOpen && (
                <div className="mx-2 mb-1 rounded-md border border-line bg-subtle p-1.5 text-[11px] text-muted">
                  {allRoots.map((item) => (
                    <label key={item} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-surface">
                      <input type="checkbox" className="accent-accent" checked={roots.includes(item)} onChange={() => onToggleRoot(item)} />
                      {ROOT_META[item] ? t(ROOT_META[item].labelKey) : item}
                    </label>
                  ))}
                </div>
              )}
              {!isCollapsed && <div className="mt-0.5">{renderNodes(nodes, root, 0)}</div>}
              {!isCollapsed && nodes.length === 0 && !creating && (
                <p className="px-3 py-1.5 text-[10px] text-muted">{t("editor.noFiles")}</p>
              )}
              {!isCollapsed && creating?.root === root && (
                <div className="px-1.5 py-0.5">
                  <input
                    autoFocus
                    className="field !px-1.5 !py-1 text-[11px]"
                    placeholder={t("editor.newFileName")}
                    onBlur={(event) => {
                      const value = event.target.value.trim();
                      if (value) onNewFile(root, creating.parent, value);
                      setCreating(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                      if (event.key === "Escape") setCreating(null);
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={(
            [
              !menu.isDir && {
                label: t("editor.openFile"),
                icon: <FileText size={13} />,
                onClick: () => onOpen(menu.root, menu.path, menu.name),
              },
              menu.isDir && {
                label: t("editor.newFile"),
                icon: <FilePlus2 size={13} />,
                onClick: () => setCreating({ root: menu.root, parent: menu.path }),
              },
              {
                label: t("editor.rename"),
                icon: <Pencil size={13} />,
                disabled: isProtected(menu.path),
                onClick: () => setRenaming({ root: menu.root, path: menu.path, name: menu.name }),
              },
              {
                label: t("editor.copyPath"),
                icon: <Copy size={13} />,
                onClick: () => void navigator.clipboard.writeText(menu.path),
              },
              !menu.isDir && {
                label: t("editor.delete"),
                icon: <Trash2 size={13} />,
                danger: true,
                disabled: isProtected(menu.path),
                onClick: () => onDelete(menu.root, menu.path),
              },
            ] as Array<ContextMenuItem | false>
          ).filter((item): item is ContextMenuItem => Boolean(item))}
        />
      )}
    </aside>
  );
}
