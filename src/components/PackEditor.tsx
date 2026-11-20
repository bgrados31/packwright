import { lazy, Suspense, useState } from "react";
import { Loader2, PackageOpen } from "lucide-react";
import { useI18n } from "../i18n";
import type { Diagnostic, FileEntry, HistoryEntry, PackMeta } from "../lib/types";

const CodeEditor = lazy(() => import("./CodeEditor"));

type Props = {
  packName: string;
  dir: string;
  version: string | null;
  minecraftVersion: string | null;
  theme: "light" | "dark";
  files: FileEntry[];
  activeFile: string | null;
  content: string;
  dirty: boolean;
  diagnostics: Diagnostic[];
  history: HistoryEntry[];
  showHistory: boolean;
  meta: PackMeta | null;
  metaDirty: boolean;
  hasIcon: boolean;
  onBack: () => void;
  onSaveFile: () => void;
  onHistory: () => void;
  onRestore: (id: string) => void;
  onOpenFile: (path: string) => void;
  onContentChange: (value: string) => void;
  onMetaChange: (meta: PackMeta) => void;
  onSaveMeta: () => void;
  onUseIcon: () => void;
  onGenerateReadme: () => void;
  onExport: () => void;
  exporting: boolean;
};

export default function PackEditor(props: Props) {
  const { t } = useI18n();
  const [tab, setTab] = useState<"files" | "details">("files");
  const tabs = [
    { id: "files" as const, label: t("editor.files") },
    { id: "details" as const, label: t("editor.details") },
  ];

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
              <button className="btn btn-primary" onClick={props.onSaveFile} disabled={!props.dirty}>
                {t("editor.save")}
              </button>
            </>
          ) : (
            <button className="btn btn-primary" onClick={props.onSaveMeta} disabled={!props.metaDirty}>
              {t("editor.saveDetails")}
            </button>
          )}
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
        <div className="card mt-6 overflow-hidden">
          <div className="grid grid-cols-[210px_1fr]">
            <aside className="max-h-[600px] overflow-auto border-r border-line p-2">
              <div className="px-2 py-2 text-[11px] font-medium uppercase tracking-wide text-muted">
                {t("editor.files")}
              </div>
              {props.files.map((file) => (
                <button
                  key={file.path}
                  className={`file-row ${file.path === props.activeFile ? "active" : ""}`}
                  onClick={() => props.onOpenFile(file.path)}
                  title={file.path}
                >
                  {file.path}
                </button>
              ))}
            </aside>

            <div className="min-w-0">
              <div className="flex h-10 items-center justify-between border-b border-line px-4 text-xs">
                <span className="font-mono text-muted">{props.activeFile ?? "—"}</span>
                <div className="flex items-center gap-3">
                  {props.dirty && <span className="text-muted">{t("editor.unsaved")}</span>}
                  {props.diagnostics.length > 0 ? (
                    <span className="text-bad">{t("editor.errors", { count: props.diagnostics.length })}</span>
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
                      <button
                        key={entry.id}
                        className="btn btn-secondary text-xs"
                        onClick={() => props.onRestore(entry.id)}
                      >
                        {new Date(Number(entry.id) * 1000).toLocaleString()}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {props.diagnostics.length > 0 && (
                <div className="border-b border-bad/30 bg-bad/5 px-4 py-2">
                  {props.diagnostics.slice(0, 3).map((diagnostic, index) => (
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
                  path={props.activeFile ?? "pack.toml"}
                  value={props.content}
                  diagnostics={props.diagnostics}
                  onChange={props.onContentChange}
                />
              </Suspense>
            </div>
          </div>
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
    </div>
  );
}
