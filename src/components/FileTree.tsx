import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Binary,
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
  Gamepad2,
  Package,
  Pencil,
  RefreshCw,
  Search,
  Settings2,
  Trash2,
} from "lucide-react";
import { useI18n } from "../i18n";
import type { TreeNode } from "../lib/types";
import { fireAndForget } from "../lib/error";
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
  onMove: (root: string, path: string, targetDir: string) => void;
  onTreesChange?: (trees: Record<string, TreeNode[]>) => void;
};

const isProtected = (path: string, root: string): boolean => {
  if (root === "instance") return isInstanceProtected(path);
  const value = path.replace(/\\/g, "/");
  return (
    value === "pack.toml" ||
    value === "index.toml" ||
    (value.startsWith("mods/") && value.endsWith(".pw.toml")) ||
    value.startsWith(".packwright/")
  );
};

type RootLabelKey = "editor.root.pack" | "editor.root.packwiz" | "editor.root.packwright" | "editor.root.instance";

const ROOT_META: Record<string, { labelKey: RootLabelKey; icon: typeof Folder }> = {
  pack: { labelKey: "editor.root.pack", icon: FolderTree },
  packwiz: { labelKey: "editor.root.packwiz", icon: Package },
  packwright: { labelKey: "editor.root.packwright", icon: FolderTree },
  instance: { labelKey: "editor.root.instance", icon: Gamepad2 },
};

const BINARY_EXTENSIONS = [".jar", ".zip", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ogg", ".wav", ".mp3", ".mp4", ".nbt", ".dat", ".bin", ".class", ".so", ".dll", ".exe", ".pdf"];

const isBinary = (name: string) => BINARY_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext));

const isInstanceProtected = (path: string) => {
  const value = path.replace(/\\/g, "/").toLowerCase();
  return ["instance.json", "packwiz.url", "mmc-pack.json", "instance.cfg"].includes(value);
};

function FileIcon({ name }: { name: string }) {
  if (isBinary(name)) return <Binary size={14} className="shrink-0 text-muted" />;
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

export default function FileTree({ dir, roots, allRoots, activeKey, revision, onOpen, onToggleRoot, onRename, onDelete, onNewFile, onMove, onTreesChange }: Props) {
  const { t } = useI18n();
  const [trees, setTrees] = useState<Record<string, TreeNode[]>>({});
  const [localRevision, setLocalRevision] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["pack", "packwiz", "packwright", "instance"]));
  const [collapsedRoots, setCollapsedRoots] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; root: string; path: string; name: string; isDir: boolean } | null>(null);
  const [renaming, setRenaming] = useState<{ root: string; path: string; name: string } | null>(null);
  const [creating, setCreating] = useState<{ root: string; parent: string } | null>(null);
  const [dragging, setDragging] = useState<{ root: string; path: string } | null>(null);
  const [dropInto, setDropInto] = useState<string | null>(null);
  const [dropBefore, setDropBefore] = useState<string | null>(null);
  const [order, setOrder] = useState<Record<string, string[]>>(() => {
    try { return JSON.parse(localStorage.getItem("packwright-file-order") ?? "{}"); }
    catch { return {}; }
  });

  const orderKey = (root: string, parent: string) => `${dir}|${root}|${parent}`;
  const parentOf = (path: string) => path.split("/").slice(0, -1).join("/");

  const persistOrder = (next: Record<string, string[]>) => {
    setOrder(next);
    localStorage.setItem("packwright-file-order", JSON.stringify(next));
  };

  /** Orden manual guardado por carpeta; los archivos nuevos caen al final. */
  const sortNodes = (nodes: TreeNode[], root: string, parent: string) => {
    const saved = order[orderKey(root, parent)];
    if (!saved) return nodes;
    const index = new Map(saved.map((path, position) => [path, position]));
    return [...nodes].sort(
      (a, b) => (index.get(a.path) ?? 1_000_000) - (index.get(b.path) ?? 1_000_000),
    );
  };

  const findSiblings = (nodes: TreeNode[], parent: string): string[] => {
    if (!parent) return nodes.map((node) => node.path);
    for (const node of nodes) {
      if (node.kind === "dir" && node.path === parent) return node.children.map((child) => child.path);
      if (node.kind === "dir") {
        const found = findSiblings(node.children, parent);
        if (found.length > 0) return found;
      }
    }
    return [];
  };

  const reorder = (root: string, source: string, target: string) => {
    const parent = parentOf(target);
    if (parentOf(source) !== parent || source === target) return;
    const siblings = findSiblings(trees[root] ?? [], parent);
    if (!siblings.includes(source) || !siblings.includes(target)) return;
    const next = siblings.filter((path) => path !== source);
    next.splice(next.indexOf(target), 0, source);
    persistOrder({ ...order, [orderKey(root, parent)]: next });
  };

  const finishDrag = () => {
    setDragging(null);
    setDropInto(null);
    setDropBefore(null);
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      roots.map(async (root) => {
        const nodes = root === "instance"
          ? await invoke<TreeNode[]>("instance_tree", { dir }).catch(() => [] as TreeNode[])
          : await invoke<TreeNode[]>("pack_tree", { dir, scope: root }).catch(() => [] as TreeNode[]);
        return [root, nodes] as const;
      }),
    ).then((entries) => {
      if (cancelled) return;
      const next = Object.fromEntries(entries);
      setTrees(next);
      onTreesChange?.(next);
    });
    return () => { cancelled = true; };
  }, [dir, roots, revision, localRevision]);

  const toggleDir = (path: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const renderNodes = (nodes: TreeNode[], root: string, depth: number, parent: string): React.ReactNode =>
    sortNodes(nodes, root, parent).map((node) => {
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
            className={`tree-row ${activeKey === `${root}:${node.path}` ? "active" : ""} ${dropInto === node.path ? "drop-into" : ""} ${dropBefore === node.path ? "drop-before" : ""}`}
            style={{ paddingLeft: 8 + depth * 14 }}
            draggable={!isDir && !isProtected(node.path, root)}
            onDragStart={(event) => {
              if (isDir || isProtected(node.path, root)) { event.preventDefault(); return; }
              event.dataTransfer.effectAllowed = "move";
              setDragging({ root, path: node.path });
            }}
            onDragEnd={finishDrag}
            onDragOver={(event) => {
              if (!dragging || dragging.root !== root || dragging.path === node.path) return;
              event.preventDefault();
              event.stopPropagation();
              setDropInto(isDir ? node.path : null);
              setDropBefore(isDir ? null : node.path);
            }}
            onDragLeave={() => { setDropInto(null); setDropBefore(null); }}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (dragging && dragging.root === root) {
                if (isDir) {
                  if (parentOf(dragging.path) !== node.path) onMove(root, dragging.path, node.path);
                } else {
                  reorder(root, dragging.path, node.path);
                }
              }
              finishDrag();
            }}
            onClick={() => {
              if (isDir) return toggleDir(node.path);
              if (root === "instance" && isBinary(node.name)) return;
              onOpen(root, node.path, node.name);
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              setMenu({ x: event.clientX, y: event.clientY, root, path: node.path, name: node.name, isDir });
            }}
            title={root === "instance" && isBinary(node.name)
              ? `${node.path} · ${(node.size / 1024).toFixed(0)} KB · ${t("editor.binaryFile")}`
              : `${node.path} · ${t("editor.dragHint")}`}
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
            <span className={`truncate ${root === "instance" && isBinary(node.name) ? "opacity-60" : ""}`}>{node.name}</span>
            {root === "instance" && isBinary(node.name) && <span className="ml-auto shrink-0 font-mono text-[9px] text-muted">BIN</span>}
          </button>
          {isDir && isOpen && renderNodes(node.children, root, depth + 1, node.path)}
        </div>
      );
    });

  return (
    <aside className="file-explorer">
      <div className="file-explorer-head">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold">{t("editor.explorer")}</span>
          <div className="flex items-center gap-0.5">
            <button
              className={`icon-btn !h-6 !w-6 ${settingsOpen ? "text-accent" : ""}`}
              onClick={() => setSettingsOpen((value) => !value)}
              title={t("editor.rootSettings")}
              aria-label={t("editor.rootSettings")}
            >
              <Settings2 size={12} />
            </button>
            <button
              className="icon-btn !h-6 !w-6"
              onClick={() => setLocalRevision((value) => value + 1)}
              title={t("common.refresh")}
              aria-label={t("common.refresh")}
            >
              <RefreshCw size={12} />
            </button>
          </div>
        </div>
        <div className="relative mt-2">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            className="field field-icon py-1.5 text-[11px]"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("editor.filterFiles")}
          />
        </div>
        {settingsOpen && (
          <div className="roots-panel">
            <p className="roots-panel-title">{t("editor.rootSettings")}</p>
            {allRoots.map((item) => (
              <label key={item} className="roots-panel-item">
                <input
                  type="checkbox"
                  className="accent-accent"
                  checked={roots.includes(item)}
                  onChange={() => onToggleRoot(item)}
                />
                {ROOT_META[item] ? t(ROOT_META[item].labelKey) : item}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="file-explorer-roots">
        {roots.map((root) => {
          const meta = ROOT_META[root] ?? { labelKey: "editor.root.pack" as const, icon: FolderTree };
          const RootIcon = meta.icon;
          const isCollapsed = collapsedRoots.has(root);
          const nodes = filterNodes(trees[root] ?? [], query);
          return (
            <div key={root} className="mb-1">
              <div
                className={`tree-root ${dropInto === `__root:${root}` ? "drop-into" : ""}`}
                onDragOver={(event) => {
                  if (!dragging || dragging.root !== root) return;
                  event.preventDefault();
                  setDropInto(`__root:${root}`);
                  setDropBefore(null);
                }}
                onDragLeave={() => setDropInto(null)}
                onDrop={(event) => {
                  event.preventDefault();
                  if (dragging?.root === root && parentOf(dragging.path)) onMove(root, dragging.path, "");
                  finishDrag();
                }}
              >
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
              </div>
              {!isCollapsed && <div className="mt-0.5">{renderNodes(nodes, root, 0, "")}</div>}
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
                disabled: menu.root === "instance" && isBinary(menu.name),
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
                disabled: isProtected(menu.path, menu.root),
                onClick: () => setRenaming({ root: menu.root, path: menu.path, name: menu.name }),
              },
              {
                label: t("editor.copyPath"),
                icon: <Copy size={13} />,
                onClick: () => fireAndForget(navigator.clipboard.writeText(menu.path)),
              },
              !menu.isDir && {
                label: t("editor.delete"),
                icon: <Trash2 size={13} />,
                danger: true,
                disabled: isProtected(menu.path, menu.root),
                onClick: () => onDelete(menu.root, menu.path),
              },
            ] as Array<ContextMenuItem | false>
          ).filter((item): item is ContextMenuItem => Boolean(item))}
        />
      )}
    </aside>
  );
}
