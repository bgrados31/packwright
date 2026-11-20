import { lazy, Suspense, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { Copy, ImagePlus, Loader2, PackageOpen, Radio, Settings2, Trash2, X } from "lucide-react";
import { useI18n } from "../i18n";
import type {
  AppConfig,
  FileEntry,
  HistoryEntry,
  ModOperation,
  OpenFile,
  PackMeta,
} from "../lib/types";
import type { EditorSettings } from "./CodeEditor";
import FileTree from "./FileTree";
import ModsView from "./ModsView";
import { clearImageCache } from "./PackImage";
import PackImage from "./PackImage";
import { Checkbox, ContextMenu, type ContextMenuItem } from "./ui";
import ServeModal from "./ServeModal";

const CodeEditor = lazy(() => import("./CodeEditor"));

type Props = {
  packName: string;
  dir: string;
  version: string | null;
  minecraftVersion: string | null;
  loader: string | null;
  theme: "light" | "dark";
  files: FileEntry[];
  openFiles: OpenFile[];
  activeKey: string | null;
  config: AppConfig;
  treeRevision: number;
  history: HistoryEntry[];
  showHistory: boolean;
  meta: PackMeta | null;
  metaDirty: boolean;
  hasIcon: boolean;
  onBack: () => void;
  onSaveFile: () => void;
  onHistory: () => void;
  onRestore: (id: string) => void;
  onOpenFile: (root: string, path: string, name: string) => void;
  onCloseFile: (key: string) => void;
  onReorderFiles: (keys: string[]) => void;
  onCloseOthers: (key: string) => void;
  onCloseAll: () => void;
  onCloseToRight: (key: string) => void;
  onContentChange: (value: string) => void;
  onEditorSettingsChange: (settings: Partial<AppConfig>) => void;
  onToggleRoot: (root: string) => void;
  onRenameFile: (root: string, path: string, name: string) => void;
  onDeleteFile: (root: string, path: string) => void;
  onNewFile: (root: string, parent: string, name: string) => void;
  onMetaChange: (meta: PackMeta) => void;
  onSaveMeta: () => void;
  onUseIcon: () => void;
  onGenerateReadme: () => void;
  onExport: () => void;
  exporting: boolean;
  onAssetsChanged: () => void;
  modsRevision: number;
  onModOperation: (operation: ModOperation) => void;
};

export default function PackEditor(props: Props) {
  const { t } = useI18n();
  const [tab, setTab] = useState<"mods" | "files" | "details">("mods");
  const tabs = [
    { id: "mods" as const, label: t("mods.title") },
    { id: "files" as const, label: t("editor.files") },
    { id: "details" as const, label: t("editor.details") },
  ];

  const iconInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [serveOpen, setServeOpen] = useState(false);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [tabMenu, setTabMenu] = useState<{ x: number; y: number; key: string; path: string } | null>(null);

  const activeTab = props.openFiles.find((file) => file.key === props.activeKey) ?? null;
  const dirty = activeTab ? activeTab.content !== activeTab.saved : false;
  const settings: EditorSettings = {
    fontSize: props.config.editor_font_size || 12,
    tabSize: props.config.editor_tab_size || 2,
    minimap: props.config.editor_minimap ?? true,
    wordWrap: props.config.editor_word_wrap ?? true,
  };

  const messageOf = (error: unknown) =>
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message: unknown }).message)
      : String(error);

  const upload = async (kind: "icon" | "banner" | "gallery", files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadError(null);
    try {
      for (const file of Array.from(files)) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        await invoke("pack_image_set", {
          dir: props.dir,
          kind,
          name: file.name,
          bytes: Array.from(bytes),
        });
      }
      clearImageCache(props.dir);
      props.onAssetsChanged();
    } catch (error) {
      setUploadError(messageOf(error));
    } finally {
      setUploading(false);
    }
  };

  const removeImage = async (path: string) => {
    try {
      await invoke("pack_image_remove", { dir: props.dir, path });
      clearImageCache(props.dir);
      props.onAssetsChanged();
    } catch (error) {
      setUploadError(messageOf(error));
    }
  };

  return (
    <div>
      <button className="text-sm text-muted hover:text-ink" onClick={props.onBack}>
        ← {t("editor.back")}
      </button>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{props.packName}</h1>
          <p className="mt-1 font-mono text-xs text-muted">{props.dir}</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={() => setServeOpen(true)} title={t("serve.title")}>
            <Radio size={14} /> {t("serve.title")}
          </button>
          <button
            className="btn btn-secondary"
            onClick={props.onExport}
            disabled={props.exporting}
            title={t("export.button")}
          >
            {props.exporting ? <Loader2 size={14} className="spin" /> : <PackageOpen size={14} />}
            {props.exporting ? t("export.exporting") : t("export.button")}
          </button>
          {tab === "files" ? (
            <>
              <button className="btn btn-secondary" onClick={props.onHistory}>{t("editor.history")}</button>
              <button className="btn btn-primary" onClick={props.onSaveFile} disabled={!dirty}>
                {t("editor.save")}
              </button>
            </>
          ) : tab === "details" ? (
            <button className="btn btn-primary" onClick={props.onSaveMeta} disabled={!props.metaDirty}>
              {t("editor.saveDetails")}
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-5 flex gap-1 border-b border-line">
        {tabs.map((item) => (
          <button
            key={item.id}
            className={`border-b-2 px-3 pb-2 text-sm transition-colors ${
              tab === item.id ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"
            }`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "files" ? (
        <div className="editor-shell mt-6">
          <FileTree
            dir={props.dir}
            roots={props.config.editor_roots}
            allRoots={["pack", "packwiz", "packwright"]}
            activeKey={props.activeKey}
            revision={props.treeRevision}
            onOpen={props.onOpenFile}
            onToggleRoot={props.onToggleRoot}
            onRename={props.onRenameFile}
            onDelete={props.onDeleteFile}
            onNewFile={props.onNewFile}
          />

          <div className="editor-main">
            <div className="editor-tabs">
              {props.openFiles.map((file) => (
                <button
                  key={file.key}
                  draggable
                  className={`editor-tab ${file.key === props.activeKey ? "active" : ""} ${dragKey === file.key ? "dragging" : ""} ${overKey === file.key ? "drop-target" : ""}`}
                  onClick={() => props.onOpenFile(file.root, file.path, file.name)}
                  onDragStart={(event) => { setDragKey(file.key); event.dataTransfer.effectAllowed = "move"; }}
                  onDragOver={(event) => { event.preventDefault(); setOverKey(file.key); }}
                  onDragLeave={() => setOverKey((current) => (current === file.key ? null : current))}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (dragKey && dragKey !== file.key) {
                      const keys = props.openFiles.map((item) => item.key).filter((key) => key !== dragKey);
                      keys.splice(keys.indexOf(file.key), 0, dragKey);
                      props.onReorderFiles(keys);
                    }
                    setDragKey(null);
                    setOverKey(null);
                  }}
                  onDragEnd={() => { setDragKey(null); setOverKey(null); }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setTabMenu({ x: event.clientX, y: event.clientY, key: file.key, path: file.path });
                  }}
                  title={file.path}
                >
                  <span className="truncate">{file.name}</span>
                  {file.content !== file.saved && <span className="editor-dirty-dot" />}
                  <span
                    className="editor-tab-close"
                    onClick={(event) => { event.stopPropagation(); props.onCloseFile(file.key); }}
                  >
                    <X size={11} />
                  </span>
                </button>
              ))}
              <button className="icon-btn ml-auto !h-6 !w-6" onClick={() => setSettingsOpen((value) => !value)} title={t("editor.settings")}>
                <Settings2 size={13} />
              </button>
            </div>

            {settingsOpen && (
              <div className="editor-settings">
                <label className="flex items-center gap-2">
                  <span>{t("editor.fontSize")}</span>
                  <input
                    className="field !w-14 !px-2 !py-1"
                    type="number"
                    min={10}
                    max={22}
                    value={settings.fontSize}
                    onChange={(event) => props.onEditorSettingsChange({ editor_font_size: Number(event.target.value) })}
                  />
                </label>
                <label className="flex items-center gap-2">
                  <span>{t("editor.tabSize")}</span>
                  <input
                    className="field !w-14 !px-2 !py-1"
                    type="number"
                    min={1}
                    max={8}
                    value={settings.tabSize}
                    onChange={(event) => props.onEditorSettingsChange({ editor_tab_size: Number(event.target.value) })}
                  />
                </label>
                <Checkbox
                  size="sm"
                  checked={settings.minimap}
                  onChange={(checked) => props.onEditorSettingsChange({ editor_minimap: checked })}
                  label={t("editor.minimap")}
                />
                <Checkbox
                  size="sm"
                  checked={settings.wordWrap}
                  onChange={(checked) => props.onEditorSettingsChange({ editor_word_wrap: checked })}
                  label={t("editor.wordWrap")}
                />
              </div>
            )}

            {activeTab ? (
              <>
                <div className="editor-info">
                  <span className="truncate font-mono text-muted">{activeTab.path}</span>
                  <div className="flex items-center gap-3">
                    {dirty && <span className="text-muted">{t("editor.unsaved")}</span>}
                    {activeTab.diagnostics.length > 0 ? (
                      <span className="text-bad">{t("editor.errors", { count: activeTab.diagnostics.length })}</span>
                    ) : (
                      <span className="text-ok">{t("editor.noErrors")}</span>
                    )}
                  </div>
                </div>

                {props.showHistory && (
                  <div className="border-b border-line bg-subtle px-4 py-3">
                    <div className="mb-2 text-xs font-medium text-muted">{t("editor.previousVersions")}</div>
                    <div className="flex flex-wrap gap-2">
                      {props.history.length === 0 && (
                        <span className="text-xs text-muted">{t("editor.noPrevious")}</span>
                      )}
                      {props.history.map((entry) => (
                        <button key={entry.id} className="btn btn-secondary text-xs" onClick={() => props.onRestore(entry.id)}>
                          {new Date(Number(entry.id) * 1000).toLocaleString()}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab.diagnostics.length > 0 && (
                  <div className="border-b border-bad/30 bg-bad/5 px-4 py-2">
                    {activeTab.diagnostics.slice(0, 3).map((diagnostic, index) => (
                      <div key={index} className="output-line err">
                        {diagnostic.line}:{diagnostic.column} — {diagnostic.message.split("\n")[0]}
                      </div>
                    ))}
                  </div>
                )}

                <Suspense
                  fallback={
                    <div className="grid h-[520px] place-items-center text-sm text-muted">
                      {t("editor.loading")}
                    </div>
                  }
                >
                  <CodeEditor
                    theme={props.theme}
                    path={activeTab.path}
                    value={activeTab.content}
                    diagnostics={activeTab.diagnostics}
                    settings={settings}
                    onCursor={(line, column) => setCursor({ line, column })}
                    onChange={props.onContentChange}
                  />
                </Suspense>

                <div className="editor-statusbar">
                  <span>Ln {cursor.line}, Col {cursor.column}</span>
                  <span>{settings.tabSize} {t("editor.spaces")}</span>
                  <span>UTF-8</span>
                  <span>{activeTab.path.split(".").pop()?.toUpperCase() ?? "TXT"}</span>
                </div>
              </>
            ) : (
              <div className="grid flex-1 place-items-center text-sm text-muted">{t("editor.noFileOpen")}</div>
            )}
          </div>
        </div>
      ) : tab === "mods" ? (
        <div className="view-enter mt-6">
          <ModsView
            dir={props.dir}
            minecraftVersion={props.minecraftVersion}
            loader={props.loader}
            revision={props.modsRevision}
            onOperation={props.onModOperation}
          />
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-[1fr_320px] gap-6">
          <div className="card p-6">
            <h2 className="text-lg font-semibold">{t("details.title")}</h2>
            <p className="mt-1 text-sm text-muted">{t("details.subtitle")}</p>

            {props.meta && (
              <div className="mt-6 flex flex-col gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted">{t("details.summary")}</span>
                  <textarea
                    className="field resize-y"
                    rows={3}
                    maxLength={200}
                    value={props.meta.summary}
                    onChange={(event) => props.onMetaChange({ ...props.meta!, summary: event.target.value })}
                    placeholder={t("details.summaryPlaceholder")}
                  />
                </label>

                <div className="grid grid-cols-2 gap-4">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs text-muted">{t("details.license")}</span>
                    <input
                      className="field"
                      value={props.meta.license}
                      onChange={(event) => props.onMetaChange({ ...props.meta!, license: event.target.value })}
                      placeholder="MIT"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs text-muted">{t("details.categories")}</span>
                    <input
                      className="field"
                      value={props.meta.categories.join(", ")}
                      onChange={(event) =>
                        props.onMetaChange({
                          ...props.meta!,
                          categories: event.target.value.split(",").map((c) => c.trim()).filter(Boolean),
                        })
                      }
                      placeholder={t("details.categoriesPlaceholder")}
                    />
                  </label>
                </div>

                <label className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted">{t("details.website")}</span>
                  <input
                    className="field"
                    value={props.meta.homepage}
                    onChange={(event) => props.onMetaChange({ ...props.meta!, homepage: event.target.value })}
                    placeholder="https://…"
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted">{t("details.source")}</span>
                  <input
                    className="field"
                    value={props.meta.source}
                    onChange={(event) => props.onMetaChange({ ...props.meta!, source: event.target.value })}
                    placeholder="https://github.com/…"
                  />
                </label>

                <div className="mt-2 flex flex-wrap gap-2 border-t border-line pt-4">
                  <button className="btn btn-secondary" onClick={props.onUseIcon}>{t("details.useIcon")}</button>
                  <button className="btn btn-secondary" onClick={props.onGenerateReadme}>
                    {t("details.generateReadme")}
                  </button>
                </div>

                <div className="mt-6 border-t border-line pt-5">
                  <h3 className="text-sm font-semibold">{t("editor.assetsTitle")}</h3>
                  <p className="mt-1 text-[11px] leading-5 text-muted">{t("editor.assetsBody")}</p>

                  <div className="mt-4 grid grid-cols-2 gap-5">
                    <div>
                      <span className="text-xs text-muted">{t("editor.iconSection")}</span>
                      <div className="mt-2 flex items-center gap-3">
                        <PackImage
                          dir={props.dir}
                          path={props.meta?.icon}
                          className="h-14 w-14 rounded-xl object-cover ring-1 ring-line"
                        />
                        <div className="flex flex-col items-start gap-1">
                          <button
                            className="btn btn-secondary"
                            onClick={() => iconInput.current?.click()}
                            disabled={uploading}
                          >
                            <ImagePlus size={13} /> {t("editor.upload")}
                          </button>
                          {props.meta?.icon && (
                            <button
                              className="btn btn-quiet text-[10px]"
                              onClick={() => void removeImage(props.meta!.icon)}
                            >
                              {t("editor.removeImage")}
                            </button>
                          )}
                        </div>
                      </div>
                      <input
                        ref={iconInput}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(event) => {
                          void upload("icon", event.target.files);
                          event.target.value = "";
                        }}
                      />
                    </div>

                    <div>
                      <span className="text-xs text-muted">{t("editor.bannerSection")}</span>
                      <div className="mt-2">
                        {props.meta?.banner ? (
                          <PackImage
                            dir={props.dir}
                            path={props.meta.banner}
                            className="h-16 w-full rounded-lg object-cover ring-1 ring-line"
                          />
                        ) : (
                          <div className="grid h-16 w-full place-items-center rounded-lg border border-dashed border-line text-[10px] text-muted">
                            {t("editor.noBanner")}
                          </div>
                        )}
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            className="btn btn-secondary"
                            onClick={() => bannerInput.current?.click()}
                            disabled={uploading}
                          >
                            <ImagePlus size={13} /> {t("editor.upload")}
                          </button>
                          {props.meta?.banner && (
                            <button
                              className="btn btn-quiet text-[10px]"
                              onClick={() => void removeImage(props.meta!.banner)}
                            >
                              {t("editor.removeImage")}
                            </button>
                          )}
                        </div>
                      </div>
                      <input
                        ref={bannerInput}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(event) => {
                          void upload("banner", event.target.files);
                          event.target.value = "";
                        }}
                      />
                    </div>
                  </div>

                  <div className="mt-5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs text-muted">{t("editor.gallerySection")}</span>
                      <button
                        className="btn btn-secondary"
                        onClick={() => galleryInput.current?.click()}
                        disabled={uploading}
                      >
                        <ImagePlus size={13} /> {t("editor.addImages")}
                      </button>
                    </div>
                    <input
                      ref={galleryInput}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(event) => {
                        void upload("gallery", event.target.files);
                        event.target.value = "";
                      }}
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(props.meta?.gallery ?? []).length === 0 && (
                        <span className="text-[11px] text-muted">{t("editor.noImages")}</span>
                      )}
                      {(props.meta?.gallery ?? []).map((path) => (
                        <div key={path} className="group relative">
                          <PackImage
                            dir={props.dir}
                            path={path}
                            className="h-16 w-20 rounded-lg object-cover ring-1 ring-line"
                          />
                          <button
                            className="remove-image-btn"
                            onClick={() => void removeImage(path)}
                            title={t("editor.removeImage")}
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {uploading && <p className="mt-3 text-[11px] text-muted">{t("editor.uploading")}</p>}
                  {uploadError && <p className="mt-3 text-[11px] text-bad">{uploadError}</p>}
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="text-xs font-medium text-muted">{t("details.preview")}</div>
            <div className="card mt-2 overflow-hidden">
              <div className="flex h-28 items-center justify-center bg-subtle">
                <img src="/packwright-mark.png" alt="" className="h-16 w-16" />
              </div>
              <div className="p-5">
                <h3 className="font-semibold">{props.packName}</h3>
                <p className="mt-2 line-clamp-3 text-sm leading-5 text-muted">
                  {props.meta?.summary || t("details.noSummary")}
                </p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {props.minecraftVersion && <span className="chip">MC {props.minecraftVersion}</span>}
                  {props.meta?.categories.slice(0, 3).map((category) => (
                    <span key={category} className="chip">{category}</span>
                  ))}
                </div>
                <p className="mt-4 text-xs text-muted">v{props.version ?? "—"}</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-muted">
              <span className={props.hasIcon ? "text-ok" : "text-bad"}>
                {props.hasIcon ? t("details.iconReady") : t("details.iconMissing")}
              </span>
            </p>
          </div>
        </div>
      )}

      {serveOpen &&
        createPortal(
          <ServeModal
            dir={props.dir}
            port={props.config.serve_port || 8080}
            onClose={() => setServeOpen(false)}
          />,
          document.body,
        )}

      {tabMenu && (
        <ContextMenu
          x={tabMenu.x}
          y={tabMenu.y}
          onClose={() => setTabMenu(null)}
          items={[
            { label: t("editor.closeTab"), icon: <X size={13} />, onClick: () => props.onCloseFile(tabMenu.key) },
            { label: t("editor.closeOthers"), onClick: () => props.onCloseOthers(tabMenu.key) },
            { label: t("editor.closeToRight"), onClick: () => props.onCloseToRight(tabMenu.key) },
            { label: t("editor.closeAll"), onClick: () => props.onCloseAll() },
            { label: t("editor.copyPath"), icon: <Copy size={13} />, onClick: () => void navigator.clipboard.writeText(tabMenu.path) },
          ] as ContextMenuItem[]}
        />
      )}
    </div>
  );
}
