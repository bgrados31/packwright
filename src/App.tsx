import { useCallback, useEffect, useMemo, useState } from "react";
import { fireAndForget, messageOf as errorText } from "./lib/error";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  FileArchive,
  Gamepad2,
  Globe,
  House,
  Keyboard,
  Layers,
  LayoutGrid,
  Moon,
  PackageOpen,
  Plus,
  Server,
  Settings2,
  Sun,
} from "lucide-react";
import "./App.css";

import CreatePackForm from "./components/CreatePackForm";
import WelcomeView from "./components/WelcomeView";
import PackEditor from "./components/PackEditor";
import SetupView from "./components/SetupView";
import Sidebar, { type SidebarView } from "./components/Sidebar";
import PacksView from "./components/PacksView";
import HomeView from "./components/HomeView";
import SettingsView from "./components/SettingsView";
import ServersView from "./components/ServersView";
import LauncherView from "./components/LauncherView";
import ExportModal from "./components/ExportModal";
import Toasts, { type Toast } from "./components/Toasts";
import Topbar from "./components/Topbar";
import ShortcutsModal from "./components/ShortcutsModal";
import UpdateToast from "./components/UpdateToast";
import DebugConsole from "./components/DebugConsole";
import ImportModal from "./components/ImportModal";
import ProfileModal from "./components/ProfileModal";
import CommandPalette, { type PaletteAction } from "./components/CommandPalette";
import ConfirmDeleteModal from "./components/ConfirmDeleteModal";
import type { PackProfile } from "./lib/profiles";
import { useI18n, type TranslationKey } from "./i18n";
import {
  type AppConfig,
  type CreatePackInput,
  type Diagnostic,
  type FileEntry,
  type HistoryEntry,
  type InstalledMod,
  type LoaderVersion,
  type McVersion,
  type ModHistoryEntry,
  type OpenFile,
  type ModHistoryItem,
  type ModOperation,
  type ModVersion,
  type OpLine,
  type PackInfo,
  type PackMeta,
  type PackwizStatus,
} from "./lib/types";

const emptyForm: CreatePackInput = {
  name: "",
  author: "",
  minecraft_version: "",
  loader: "neoforge",
  loaderVersion: null,
  version: "1.0.0",
  description: "",
};

function toHistoryItem(mod: InstalledMod): ModHistoryItem {
  return { id: mod.id, name: mod.name, version: mod.version_id };
}

function rootForPath(path: string): string {
  const value = path.replace(/\\/g, "/");
  if (value.startsWith(".packwright/")) return "packwright";
  if (
    value === "pack.toml" ||
    value === "index.toml" ||
    (value.startsWith("mods/") && value.endsWith(".pw.toml"))
  ) {
    return "packwiz";
  }
  return "pack";
}

function fileKey(root: string, path: string): string {
  return `${root}:${path}`;
}

export default function App() {
  const { t, locale, setLocale } = useI18n();
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    document.documentElement.classList.contains("dark") ? "dark" : "light",
  );
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [packwiz, setPackwiz] = useState<PackwizStatus | null>(null);
  const [packs, setPacks] = useState<PackInfo[]>([]);
  const [form, setForm] = useState<CreatePackInput>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportTarget, setExportTarget] = useState<string | null>(null);
  const [deletePackTarget, setDeletePackTarget] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [modsRevision, setModsRevision] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [view, setView] = useState<SidebarView>("home");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("packwright-sidebar") === "collapsed",
  );

  const [selectedPack, setSelectedPack] = useState<string | null>(null);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [treeRevision, setTreeRevision] = useState(0);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [meta, setMeta] = useState<PackMeta | null>(null);
  const [metaDirty, setMetaDirty] = useState(false);
  const [hasIcon, setHasIcon] = useState(false);

  const activeTab = openFiles.find((file) => file.key === activeKey) ?? null;

  const [mcVersions, setMcVersions] = useState<McVersion[]>([]);
  const [loaderVersions, setLoaderVersions] = useState<LoaderVersion[]>([]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    // Keeps native controls (scrollbars, inputs, dialogs) in sync with the app theme.
    document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#0a0c11" : "#f1ede8");
    localStorage.setItem("packwright-theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("packwright-sidebar", sidebarCollapsed ? "collapsed" : "expanded");
  }, [sidebarCollapsed]);

  const loadPacks = useCallback(async () => {
    try {
      const [cfg, status, list] = await Promise.all([
        invoke<AppConfig>("config_get"),
        invoke<PackwizStatus>("packwiz_status"),
        invoke<PackInfo[]>("pack_list"),
      ]);
      setConfig(cfg);
      setPackwiz(status);
      setPacks(list);
      setForm((previous) =>
        previous.loader === "neoforge" && cfg.default_loader
          ? { ...previous, loader: cfg.default_loader }
          : previous,
      );
    } catch (cause) {
      setError(errorText(cause));
    }
  }, []);

  const saveConfig = async (next: AppConfig) => {
    try {
      const saved = await invoke<AppConfig>("config_set", { config: next });
      setConfig(saved);
      if (saved.locale === "en" || saved.locale === "es") setLocale(saved.locale);
      await loadPacks();
    } catch (cause) {
      setError(errorText(cause));
    }
  };

  useEffect(() => {
    loadPacks();
  }, [loadPacks]);

  useEffect(() => {
    invoke<McVersion[]>("versions_catalog")
      .then(setMcVersions)
      .catch(() => {
        setMcVersions([]);
        setForm((previous) => previous.minecraft_version ? previous : { ...previous, minecraft_version: "1.21.1" });
      });
  }, []);

  // The newest release from Mojang becomes the default selection.
  useEffect(() => {
    if (mcVersions.length === 0) return;
    setForm((previous) =>
      previous.minecraft_version ? previous : { ...previous, minecraft_version: mcVersions[0].id },
    );
  }, [mcVersions]);

  useEffect(() => {
    if (!form.minecraft_version) return;
    const loaders = mcVersions.find((version) => version.id === form.minecraft_version)?.loaders ?? [];
    if (loaders.length > 0 && !loaders.includes(form.loader)) {
      setForm((previous) => ({ ...previous, loader: loaders[0], loaderVersion: null }));
    }
  }, [form.minecraft_version, form.loader, mcVersions]);

  useEffect(() => {
    const compatible = mcVersions.find((version) => version.id === form.minecraft_version);
    if (!compatible || !compatible.loaders.includes(form.loader)) {
      setLoaderVersions([]);
      return;
    }
    let cancelled = false;
    invoke<LoaderVersion[]>("versions_loader", {
      loader: form.loader,
      mcVersion: form.minecraft_version,
    })
      .then((list) => { if (!cancelled) setLoaderVersions(list); })
      .catch(() => { if (!cancelled) setLoaderVersions([]); });
    return () => { cancelled = true; };
  }, [form.loader, form.minecraft_version, mcVersions]);

  useEffect(() => {
    if (!selectedPack || !activeTab) return;
    const key = activeTab.key;
    const timer = setTimeout(async () => {
      try {
        const found = await invoke<Diagnostic[]>("file_validate", {
          dir: selectedPack,
          path: activeTab.path,
          content: activeTab.content,
        });
        setOpenFiles((current) =>
          current.map((file) => (file.key === key ? { ...file, diagnostics: found } : file)),
        );
      } catch {
        // The file may not be indexed yet; ignore transient validation errors.
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [activeTab?.key, activeTab?.path, activeTab?.content, selectedPack]);

  const createPack = async (event?: React.FormEvent, override?: CreatePackInput): Promise<PackInfo | null> => {
    event?.preventDefault();
    const input = override ?? form;
    setBusy(true);
    setError(null);
    try {
      const created = await invoke<PackInfo>("pack_create", {
        name: input.name,
        author: input.author || "Packwright",
        minecraftVersion: input.minecraft_version,
        loader: input.loader,
        loaderVersion: input.loaderVersion,
        version: input.version,
        description: input.description,
      });
      setForm(emptyForm);
      setView("packs");
      await loadPacks();
      return created;
    } catch (cause) {
      setError(errorText(cause));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const createFromProfile = async (profile: PackProfile) => {
    setProfileOpen(false);
    const input: CreatePackInput = {
      ...emptyForm,
      name: profile.name,
      loader: profile.loader,
      minecraft_version: mcVersions[0]?.id ?? "1.21.1",
      description: profile.description,
    };
    const created = await createPack(undefined, input);
    if (!created) return;
    for (const mod of profile.mods) {
      try {
        const versions = await invoke<ModVersion[]>("mods_versions", {
          projectId: mod.id,
          mcVersion: input.minecraft_version,
          loader: profile.loader,
          projectType: "mod",
        });
        const chosen = versions.find((version) => version.release_type === "release") ?? versions[0];
        if (!chosen) continue;
        await invoke("mods_add", {
          dir: created.dir,
          projectId: mod.id,
          versionId: chosen.id,
          id: `profile-${Date.now()}-${mod.id}`,
        });
      } catch {
        // Los mods opcionales del perfil son best-effort.
      }
    }
    await loadPacks();
    pushToast(t("profiles.created", { name: profile.name }));
  };

  const openPack = async (dir: string) => {
    try {
      const list = await invoke<FileEntry[]>("pack_files", { dir });
      const details = await invoke<PackMeta>("meta_get", { dir });
      setFiles(list);
      setSelectedPack(dir);
      setView("editor");
      setShowHistory(false);
      setMeta(details);
      setMetaDirty(false);
      setHasIcon(
        await invoke<boolean>("pack_has_icon", { dir, path: details.icon || ".packwright/assets/icon.png" }),
      );
      setOpenFiles([]);
      setActiveKey(null);
      setTreeRevision((value) => value + 1);
      const first = list.find((file) => file.path === "pack.toml") ?? list[0];
      if (first) {
        const root = rootForPath(first.path);
        const text = await invoke<string>("file_read", { dir, path: first.path });
        const tab: OpenFile = {
          key: fileKey(root, first.path),
          root,
          path: first.path,
          name: first.path.split("/").pop() ?? first.path,
          content: text,
          saved: text,
          diagnostics: [],
        };
        setOpenFiles([tab]);
        setActiveKey(tab.key);
      }
    } catch (cause) {
      setError(errorText(cause));
    }
  };

  const openFile = async (root: string, path: string, name: string) => {
    if (!selectedPack) return;
    const key = fileKey(root, path);
    setActiveKey(key);
    if (openFiles.some((file) => file.key === key)) return;
    try {
      const text = await invoke<string>(
        root === "instance" ? "instance_file_read" : "file_read",
        { dir: selectedPack, path },
      );
      setOpenFiles((current) => [
        ...current,
        { key, root, path, name, content: text, saved: text, diagnostics: [] },
      ]);
    } catch (cause) {
      setError(errorText(cause));
    }
  };

  const closeFile = (key: string) => {
    const remaining = openFiles.filter((file) => file.key !== key);
    setOpenFiles(remaining);
    if (activeKey === key) setActiveKey(remaining[0]?.key ?? null);
  };

  const saveFile = useCallback(async () => {
    if (!selectedPack || !activeTab || activeTab.content === activeTab.saved) return;
    try {
      await invoke(
        activeTab.root === "instance" ? "instance_file_write" : "file_write",
        { dir: selectedPack, path: activeTab.path, content: activeTab.content },
      );
      setOpenFiles((current) =>
        current.map((file) => (file.key === activeTab.key ? { ...file, saved: file.content } : file)),
      );
      setTreeRevision((value) => value + 1);
      if (activeTab.root !== "instance") await loadPacks();
    } catch (cause) {
      setError(errorText(cause));
    }
  }, [selectedPack, activeTab, loadPacks]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editing = Boolean(
        target?.isContentEditable ||
          target?.closest?.("input, textarea, select, [contenteditable='true']"),
      );
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      // Modal dialogs own the keyboard (Escape/Tab); keep Ctrl/Cmd+K as a toggle.
      const inDialog = Boolean(document.querySelector('[role="dialog"][aria-modal="true"]'));
      if (inDialog && key !== "k") return;

      if (mod && !event.altKey) {
        if (key === "s") {
          // Save is useful even from the editor, so only skip unrelated text fields.
          if (editing && !target?.closest?.(".monaco-editor")) return;
          event.preventDefault();
          void saveFile();
          return;
        }
        if (editing) return;
        if (key === "k") {
          event.preventDefault();
          setPaletteOpen((value) => !value);
          return;
        }
        if (key === "n") {
          event.preventDefault();
          setSelectedPack(null);
          setView("create");
          return;
        }
        const destinations: Record<string, SidebarView> = {
          "1": "home", "2": "packs", "3": "servers", "4": "settings", "5": "launcher",
        };
        const destination = destinations[key];
        if (destination) {
          event.preventDefault();
          setSelectedPack(null);
          setView(destination);
        }
        return;
      }

      // "?" opens the shortcuts sheet from anywhere outside a text field.
      if (!mod && !event.altKey && event.key === "?" && !editing) {
        event.preventDefault();
        setShortcutsOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [saveFile]);

  const loadHistory = async () => {
    if (!selectedPack || !activeTab) return;
    try {
      setHistory(await invoke<HistoryEntry[]>("file_history", { dir: selectedPack, path: activeTab.path }));
      setShowHistory(true);
    } catch (cause) {
      setError(errorText(cause));
    }
  };

  const restoreVersion = async (id: string) => {
    if (!selectedPack || !activeTab) return;
    try {
      const restored = await invoke<string>("file_restore", { dir: selectedPack, path: activeTab.path, id });
      const key = activeTab.key;
      setOpenFiles((current) =>
        current.map((file) => (file.key === key ? { ...file, content: restored } : file)),
      );
      setShowHistory(false);
    } catch (cause) {
      setError(errorText(cause));
    }
  };

  const saveDetails = async () => {
    if (!selectedPack || !meta) return;
    try {
      await invoke("meta_set", { dir: selectedPack, meta });
      setMetaDirty(false);
      await loadPacks();
    } catch (cause) {
      setError(errorText(cause));
    }
  };

  const useDefaultIcon = async () => {
    if (!selectedPack) return;
    try {
      await invoke("pack_icon_set_default", { dir: selectedPack });
      setMeta((previous) => previous ? { ...previous, icon: ".packwright/assets/icon.png" } : previous);
      setMetaDirty(true);
      setHasIcon(
        await invoke<boolean>("pack_has_icon", { dir: selectedPack, path: ".packwright/assets/icon.png" }),
      );
    } catch (cause) {
      setError(errorText(cause));
    }
  };

  const generateReadme = async () => {
    if (!selectedPack) return;
    try {
      await invoke("pack_generate_readme", { dir: selectedPack });
      const list = await invoke<FileEntry[]>("pack_files", { dir: selectedPack });
      setFiles(list);
      const readme = list.find((file) => file.path === "README.md");
      if (readme) await openFile("pack", readme.path, "README.md");
      setTreeRevision((value) => value + 1);
    } catch (cause) {
      setError(errorText(cause));
    }
  };

  const reveal = async (dir: string) => {
    try {
      await invoke("pack_reveal", { dir });
    } catch (cause) {
      setError(errorText(cause));
    }
  };

  const dismissToast = (id: string) =>
    setToasts((current) => current.filter((item) => item.id !== id));

  const pushToast = (title: string, state: Toast["state"] = "success", detail?: string, duration?: number) => {
    const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((current) => [...current, { id, title, detail, state, duration }]);
  };

  const refreshTree = () => {
    setTreeRevision((value) => value + 1);
    void loadPacks();
  };

  const deletePack = async () => {
    if (!deletePackTarget) return;
    await invoke("pack_delete", { dir: deletePackTarget });
    const wasSelected = selectedPack === deletePackTarget;
    setDeletePackTarget(null);
    if (wasSelected) {
      setSelectedPack(null);
      setOpenFiles([]);
      setActiveKey(null);
      setView("packs");
    }
    await loadPacks();
    pushToast(t("delete.successPack"));
  };

  const renameFile = async (root: string, path: string, name: string) => {
    if (!selectedPack) return;
    try {
      const updated = await invoke<string>(
        root === "instance" ? "instance_file_rename" : "file_rename",
        { dir: selectedPack, path, newName: name },
      );
      const oldKey = fileKey(root, path);
      const newRoot = root === "instance" ? "instance" : rootForPath(updated);
      const newKey = fileKey(newRoot, updated);
      setOpenFiles((current) =>
        current.map((file) =>
          file.key === oldKey
            ? { ...file, key: newKey, root: newRoot, path: updated, name: updated.split("/").pop() ?? updated }
            : file,
        ),
      );
      setActiveKey((current) => (current === oldKey ? newKey : current));
      refreshTree();
      pushToast(t("editor.renamed", { name }));
    } catch (cause) {
      pushToast(t("editor.renameFailed"), "error", errorText(cause));
    }
  };

  const moveFile = async (root: string, path: string, targetDir: string) => {
    if (!selectedPack) return;
    try {
      const updated = await invoke<string>(
        root === "instance" ? "instance_file_move" : "file_move",
        { dir: selectedPack, path, targetDir },
      );
      const oldKey = fileKey(root, path);
      const newKey = fileKey(root, updated);
      const name = updated.split("/").pop() ?? updated;
      setOpenFiles((current) =>
        current.map((file) =>
          file.key === oldKey ? { ...file, key: newKey, path: updated, name } : file,
        ),
      );
      setActiveKey((current) => (current === oldKey ? newKey : current));
      refreshTree();
      pushToast(t("editor.moved", { name }));
    } catch (cause) {
      pushToast(t("editor.moveFailed"), "error", errorText(cause));
    }
  };

  const deleteFile = async (root: string, path: string) => {
    if (!selectedPack) return;
    try {
      await invoke(root === "instance" ? "instance_file_delete" : "file_delete", { dir: selectedPack, path });
      const key = fileKey(root, path);
      setOpenFiles((current) => current.filter((file) => file.key !== key));
      setActiveKey((current) => (current === key ? null : current));
      refreshTree();
      pushToast(t("editor.deleted", { name: path.split("/").pop() ?? path }));
    } catch (cause) {
      pushToast(t("editor.deleteFailed"), "error", errorText(cause));
    }
  };

  const newFile = async (root: string, parent: string, name: string) => {
    if (!selectedPack) return;
    try {
      const created = await invoke<string>(
        root === "instance" ? "instance_file_new" : "file_new",
        { dir: selectedPack, parent, name },
      );
      refreshTree();
      await openFile(root === "instance" ? "instance" : rootForPath(created), created, created.split("/").pop() ?? created);
      pushToast(t("editor.created", { name }));
    } catch (cause) {
      pushToast(t("editor.createFailed"), "error", errorText(cause));
    }
  };

  const reorderFiles = (keys: string[]) => {
    setOpenFiles((current) =>
      keys
        .map((key) => current.find((file) => file.key === key))
        .filter((file): file is OpenFile => Boolean(file)),
    );
  };

  const closeOthers = (key: string) => {
    setOpenFiles((current) => current.filter((file) => file.key === key));
    setActiveKey(key);
  };
  const closeAll = () => {
    setOpenFiles([]);
    setActiveKey(null);
  };
  const closeToRight = (key: string) => {
    setOpenFiles((current) => {
      const index = current.findIndex((file) => file.key === key);
      return index < 0 ? current : current.slice(0, index + 1);
    });
  };

  const recordModHistory = async (
    operation: ModOperation,
    ok: boolean,
    output: string[],
    main: ModHistoryItem[],
    dependencies: ModHistoryItem[],
  ) => {
    const entry: ModHistoryEntry = {
      id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      at: Date.now(),
      action: operation.kind,
      ok,
      main,
      dependencies,
      output: output.slice(-40),
    };
    try {
      await invoke("mods_history_record", { dir: operation.dir, entry });
    } catch {
      // El historial es best-effort.
    }
  };

  const runModOperation = async (operation: ModOperation) => {
    const id = `mod-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const name = operation.modName ?? t("mods.title");
    const lines: string[] = [];
    let stage = "prepare";
    const actionKey = (kind: ModOperation["kind"]): TranslationKey => {
      switch (kind) {
        case "add": return "mods.action.add";
        case "remove": return "mods.action.remove";
        case "pin": return "mods.action.pin";
        case "unpin": return "mods.action.unpin";
        case "update": return "mods.action.update";
        case "refresh": return "mods.action.refresh";
      }
    };
    const label = () => {
      const running = operation.kind === "add" && stage !== "prepare"
        ? { prepare: t("mods.stagePreparing"), download: t("mods.stageDownloading"), deps: t("mods.stageDependencies"), adding: t("mods.stageAdding") }[stage] ?? t("mods.stagePreparing")
        : t(actionKey(operation.kind));
      return `${name} · ${running}`;
    };
    const successTitle = () => {
      switch (operation.kind) {
        case "add": return t("mods.toastSuccess", { name });
        case "remove": return t("mods.toastRemoved", { name });
        case "pin": return t("mods.toastPinned", { name });
        case "unpin": return t("mods.toastUnpinned", { name });
        case "update": return t("mods.toastUpdated", { name });
        case "refresh": return t("mods.toastRefreshed");
      }
    };

    setToasts((current) => [...current, { id, title: label(), state: "running", duration: 4200 }]);

    let unlisten: (() => void) | undefined;
    const ready = listen<OpLine>("operation://line", (event) => {
      if (event.payload.id !== id) return;
      lines.push(event.payload.line);
      if (operation.kind === "add") {
        const text = lines.join(" ").toLowerCase();
        stage = text.includes("dependenc")
          ? "deps"
          : text.includes("download") || text.includes("retriev")
            ? "download"
            : text.includes("success") || text.includes("added")
              ? "adding"
              : stage;
      }
      setToasts((current) =>
        current.map((item) =>
          item.id === id
            ? { ...item, title: label(), detail: lines[lines.length - 1]?.slice(0, 72) }
            : item,
        ),
      );
    }).then((fn) => { unlisten = fn; });

    const before = await invoke<InstalledMod[]>("mods_list", { dir: operation.dir }).catch(() => [] as InstalledMod[]);
    const beforeIds = new Set(before.map((mod) => mod.id));

    try {
      await ready;
      const call = operation.kind === "add"
        ? invoke("mods_add", {
            dir: operation.dir,
            projectId: operation.projectId,
            versionId: operation.versionId,
            id,
          })
        : operation.names
          ? invoke("mods_command_bulk", {
              dir: operation.dir,
              action: operation.kind,
              names: operation.names,
              id,
            })
          : invoke("mods_command", {
              dir: operation.dir,
              action: operation.kind,
              name: operation.name,
              id,
            });
      await call;

      let main: ModHistoryItem[] = [];
      let dependencies: ModHistoryItem[] = [];
      if (operation.kind === "add") {
        const after = await invoke<InstalledMod[]>("mods_list", { dir: operation.dir }).catch(() => before);
        const added = after.filter((mod) => !beforeIds.has(mod.id));
        main = added.filter((mod) => mod.project_id === operation.projectId).map(toHistoryItem);
        dependencies = added.filter((mod) => mod.project_id !== operation.projectId).map(toHistoryItem);
        if (main.length === 0 && added.length > 0) main.push(toHistoryItem(added[0]));
      } else {
        main = (operation.names ?? (operation.name ? [operation.name] : [])).map((item) => ({
          id: item,
          name,
          version: null,
        }));
      }
      await recordModHistory(operation, true, lines, main, dependencies);
      setToasts((current) =>
        current.map((item) =>
          item.id === id
            ? {
                id,
                title: successTitle(),
                detail: dependencies.length > 0 ? t("mods.toastDeps", { count: dependencies.length }) : undefined,
                state: "success",
              }
            : item,
        ),
      );
      setModsRevision((value) => value + 1);
      void loadPacks();
    } catch (cause) {
      await recordModHistory(operation, false, [...lines, errorText(cause)], [], []);
      setToasts((current) =>
        current.map((item) =>
          item.id === id
            ? {
                id,
                title: operation.kind === "add"
                  ? t("mods.toastError", { name })
                  : t("mods.toastGenericError", { action: t(actionKey(operation.kind)), name }),
                detail: errorText(cause).slice(0, 90),
                state: "error",
              }
            : item,
        ),
      );
    } finally {
      unlisten?.();
    }
  };

  const reloadAssets = async () => {
    if (!selectedPack) return;
    try {
      const details = await invoke<PackMeta>("meta_get", { dir: selectedPack });
      setMeta(details);
      setHasIcon(
        await invoke<boolean>("pack_has_icon", {
          dir: selectedPack,
          path: details.icon || ".packwright/assets/icon.png",
        }),
      );
      await loadPacks();
    } catch (cause) {
      setError(errorText(cause));
    }
  };

  const activePack = packs.find((pack) => pack.dir === selectedPack);
  const availableLoaders = mcVersions.find((version) => version.id === form.minecraft_version)?.loaders ?? [];

  const activeView: SidebarView = selectedPack && view === "editor" ? "editor" : view;

  const paletteActions = useMemo<PaletteAction[]>(() => [
    { id: "home", label: t("nav.home"), group: t("palette.groupNavigate"), icon: <House size={14} />, hint: "⌘/Ctrl 1", run: () => { setSelectedPack(null); setView("home"); } },
    { id: "packs", label: t("nav.modpacks"), group: t("palette.groupNavigate"), icon: <LayoutGrid size={14} />, hint: "⌘/Ctrl 2", run: () => { setSelectedPack(null); setView("packs"); } },
    { id: "servers", label: t("nav.servers"), group: t("palette.groupNavigate"), icon: <Server size={14} />, hint: "⌘/Ctrl 3", run: () => { setSelectedPack(null); setView("servers"); } },
    { id: "settings", label: t("setup.settingsTitle"), group: t("palette.groupNavigate"), icon: <Settings2 size={14} />, hint: "⌘/Ctrl 4", run: () => { setSelectedPack(null); setView("settings"); } },
    { id: "launcher", label: t("nav.launcher"), group: t("palette.groupNavigate"), icon: <Gamepad2 size={14} />, hint: "⌘/Ctrl 5", run: () => setView("launcher") },
    { id: "new", label: t("nav.newPack"), group: t("palette.groupCreate"), icon: <Plus size={14} />, hint: "⌘/Ctrl N", run: () => { setSelectedPack(null); setView("create"); } },
    { id: "profile", label: t("profiles.start"), group: t("palette.groupCreate"), icon: <Layers size={14} />, run: () => setProfileOpen(true) },
    { id: "import", label: t("import.title"), group: t("palette.groupCreate"), icon: <FileArchive size={14} />, run: () => setImportOpen(true) },
    {
      id: "export",
      label: t("export.title"),
      group: t("palette.groupPack"),
      icon: <PackageOpen size={14} />,
      run: () => { if (selectedPack) setExportTarget(selectedPack); },
    },
    {
      id: "editor",
      label: t("editor.files"),
      group: t("palette.groupPack"),
      icon: <LayoutGrid size={14} />,
      run: () => { if (selectedPack) setView("editor"); },
    },
    {
      id: "theme",
      label: t("settings.theme"),
      group: t("palette.groupPreferences"),
      icon: theme === "dark" ? <Sun size={14} /> : <Moon size={14} />,
      run: () => setTheme(theme === "dark" ? "light" : "dark"),
    },
    {
      id: "language",
      label: t("setup.language"),
      group: t("palette.groupPreferences"),
      icon: <Globe size={14} />,
      run: () => setLocale(locale === "en" ? "es" : "en"),
    },
    {
      id: "shortcuts",
      label: t("palette.shortcuts"),
      group: t("palette.groupHelp"),
      icon: <Keyboard size={14} />,
      hint: "?",
      run: () => setShortcutsOpen(true),
    },
  ], [t, theme, locale, selectedPack, setLocale]);
  const inSetup = config === null || !config.setup_complete;

  return (
    <div className={`min-h-screen bg-bg text-ink ${inSetup ? "" : "app-shell"} ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <a className="skip-link" href="#main-content">{t("common.skipToContent")}</a>
      {!inSetup && (
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((value) => !value)}
          onCommands={() => setPaletteOpen(true)}
          active={activeView}
          onHome={() => { setSelectedPack(null); setView("home"); }}
          onPacks={() => { setSelectedPack(null); setView("packs"); }}
          onServers={() => { setSelectedPack(null); setView("servers"); }}
          onLauncher={() => setView("launcher")}
          onSettings={() => { setSelectedPack(null); setView("settings"); }}
          packsCount={packs.length}
          packwizReady={Boolean(packwiz?.found)}
        />
      )}

      <main className={inSetup ? "mx-auto max-w-5xl px-6 py-10" : "main-area"} id="main-content">
        {!inSetup && (
          <Topbar
            view={activeView}
            packName={activePack?.name ?? selectedPack}
            workspace={config?.workspace ?? ""}
            theme={theme}
            onCommands={() => setPaletteOpen(true)}
            onShortcuts={() => setShortcutsOpen(true)}
            onToggleTheme={() => setTheme((value) => (value === "dark" ? "light" : "dark"))}
            onNewPack={() => { setSelectedPack(null); setView("create"); }}
          />
        )}
        <div className={inSetup ? undefined : "main-content px-8 py-8"}>
        {error && (
          <div className="mb-6 flex items-center justify-between rounded-lg border border-bad/30 bg-bad/5 px-4 py-2.5 text-sm text-bad">
            <span>{error}</span>
            <button className="text-xs opacity-70 hover:opacity-100" onClick={() => setError(null)}>
              {t("common.close")}
            </button>
          </div>
        )}

        {config === null ? null : !config.setup_complete ? (
          <SetupView
            config={config}
            isSetup
            onSave={(next) => void saveConfig(next)}
            onLocaleChange={setLocale}
          />
        ) : view === "servers" ? (
          <ServersView packs={packs} />
        ) : view === "launcher" ? (
          <LauncherView packs={packs} />
        ) : view === "settings" ? (
          <div className="view-enter">
            <SettingsView
              config={config}
              theme={theme}
              onThemeChange={setTheme}
              packwizFound={Boolean(packwiz?.found)}
              onSave={(next) => void saveConfig(next)}
              onPackwizInstalled={(status) => { setPackwiz(status); void loadPacks(); }}
            />
          </div>
        ) : view === "home" ? (
          <HomeView
            packs={packs}
            workspace={config?.workspace ?? "—"}
            launchersCount={config?.launchers.length ?? 0}
            onNew={() => setView("create")}
            onGoPacks={() => setView("packs")}
            onOpenPack={(dir) => { setSelectedPack(dir); setView("editor"); }}
            onOpenWorkspace={() => fireAndForget(invoke("open_path", { path: config?.workspace ?? "" }))}
          />
        ) : view === "create" ? (
          <div className="view-enter mx-auto max-w-lg">
            <div className="mb-5 flex items-center justify-between">
              <button className="text-sm text-muted hover:text-ink" onClick={() => setView("packs")}>
                ← {t("editor.back")}
              </button>
              <button className="btn btn-secondary" onClick={() => setProfileOpen(true)}>
                <Layers size={14} /> {t("profiles.start")}
              </button>
            </div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">{t("nav.newPack")}</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">{t("welcome.cardTitle")}</h1>
            <p className="mt-1 text-sm text-muted">{t("welcome.cardSubtitle")}</p>
            <div className="card mt-6 p-6">
              <CreatePackForm
                form={form}
                onChange={setForm}
                onSubmit={createPack}
                mcVersions={mcVersions}
                loaderVersions={loaderVersions}
                packwizFound={Boolean(packwiz?.found)}
                busy={busy}
                availableLoaders={availableLoaders}
                compact
              />
            </div>
          </div>
        ) : view === "editor" ? (
          <div className="view-enter">
            <PackEditor
              key={selectedPack}
              packName={activePack?.name ?? selectedPack ?? ""}
              dir={selectedPack ?? ""}
              version={activePack?.version ?? null}
              minecraftVersion={activePack?.minecraft_version ?? null}
              loader={activePack?.loader ?? null}
              theme={theme}
              files={files}
              allRoots={["pack", "packwiz", "packwright"]}
              openFiles={openFiles}
              activeKey={activeKey}
              config={config!}
              treeRevision={treeRevision}
              history={history}
              showHistory={showHistory}
              meta={meta}
              metaDirty={metaDirty}
              hasIcon={hasIcon}
              onBack={() => { setSelectedPack(null); setOpenFiles([]); setActiveKey(null); setView("packs"); }}
              onSaveFile={() => void saveFile()}
              onHistory={() => void loadHistory()}
              onRestore={(id) => void restoreVersion(id)}
              onOpenFile={(root, path, name) => void openFile(root, path, name)}
              onCloseFile={closeFile}
              onContentChange={(value) => {
                if (!activeTab) return;
                const key = activeTab.key;
                setOpenFiles((current) =>
                  current.map((file) => (file.key === key ? { ...file, content: value } : file)),
                );
              }}
              onRenameFile={(root, path, name) => void renameFile(root, path, name)}
              onDeleteFile={(root, path) => void deleteFile(root, path)}
              onNewFile={(root, parent, name) => void newFile(root, parent, name)}
              onMoveFile={(root, path, targetDir) => void moveFile(root, path, targetDir)}
              onReorderFiles={reorderFiles}
              onCloseOthers={closeOthers}
              onCloseAll={closeAll}
              onCloseToRight={closeToRight}
              onEditorSettingsChange={(next) => void saveConfig({ ...config!, ...next })}
              onToggleRoot={(root) => {
                const current = config!.editor_roots;
                const roots = current.includes(root)
                  ? current.filter((item) => item !== root)
                  : [...current, root];
                void saveConfig({ ...config!, editor_roots: roots });
              }}
              onMetaChange={(next) => { setMeta(next); setMetaDirty(true); }}
              onSaveMeta={() => void saveDetails()}
              onUseIcon={() => void useDefaultIcon()}
              onGenerateReadme={() => void generateReadme()}
              onExport={() => setExportTarget(selectedPack)}
              exporting={selectedPack !== null && exportTarget === selectedPack}
              onAssetsChanged={() => void reloadAssets()}
              modsRevision={modsRevision}
              onModOperation={(operation) => void runModOperation(operation)}
              onDeletePack={() => selectedPack && setDeletePackTarget(selectedPack)}
              onLaunch={(dir) => { setSelectedPack(dir); setView("launcher"); }}
            />
          </div>
        ) : view === "packs" && packs.length === 0 ? (
          <WelcomeView
            form={form}
            onChange={setForm}
            onSubmit={createPack}
            mcVersions={mcVersions}
            loaderVersions={loaderVersions}
            packwizFound={Boolean(packwiz?.found)}
            busy={busy}
            workspace={config?.workspace ?? "—"}
            availableLoaders={availableLoaders}
          />
        ) : (
          <PacksView
            packs={packs}
            workspace={config?.workspace ?? "—"}
            onOpen={(dir) => void openPack(dir)}
            onReveal={(dir) => void reveal(dir)}
            onExport={setExportTarget}
            exporting={exportTarget}
            onNew={() => setView("create")}
            onImport={() => setImportOpen(true)}
            onDelete={(dir) => setDeletePackTarget(dir)}
          />
        )}
        </div>
      </main>

      {exportTarget &&
        createPortal(
          <ExportModal
            dir={exportTarget}
            packName={packs.find((pack) => pack.dir === exportTarget)?.name ?? exportTarget}
            onClose={() => setExportTarget(null)}
          />,
          document.body,
        )}

      {deletePackTarget && (
        <ConfirmDeleteModal
          kind="pack"
          name={packs.find((pack) => pack.dir === deletePackTarget)?.name ?? deletePackTarget}
          onCancel={() => setDeletePackTarget(null)}
          onConfirm={deletePack}
        />
      )}

      {profileOpen &&
        createPortal(
          <ProfileModal
            onClose={() => setProfileOpen(false)}
            onPick={(profile) => void createFromProfile(profile)}
          />,
          document.body,
        )}

      {importOpen &&
        createPortal(
          <ImportModal
            onClose={() => setImportOpen(false)}
            onImported={() => {
              setImportOpen(false);
              void loadPacks();
            }}
          />,
          document.body,
        )}

      {paletteOpen && (
        <CommandPalette actions={paletteActions} onClose={() => setPaletteOpen(false)} />
      )}

      {shortcutsOpen && <ShortcutsModal onClose={() => setShortcutsOpen(false)} />}

      <Toasts items={toasts} onDismiss={dismissToast} />
      <UpdateToast />
      {config?.debug_console && (
        <DebugConsole onClose={() => void saveConfig({ ...config, debug_console: false })} />
      )}
    </div>
  );
}
