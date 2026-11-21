import { useSyncExternalStore } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";

export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "installed"
  | "uptodate"
  | "error";

export type UpdaterState = {
  status: UpdateStatus;
  currentVersion: string;
  version: string;
  body: string;
  /** Cambio de major o "breaking" en el changelog: aviso insistente. */
  breaking: boolean;
  progress: number;
  error: string;
  autoDownload: boolean;
  dismissedVersion: string;
  /** El toast inferior es visible para esta version. */
  visible: boolean;
};

const AUTO_KEY = "packwright-auto-update";
const DISMISSED_KEY = "packwright-update-dismissed";

const listeners = new Set<() => void>();
let state: UpdaterState = {
  status: "idle",
  currentVersion: "",
  version: "",
  body: "",
  breaking: false,
  progress: 0,
  error: "",
  autoDownload: localStorage.getItem(AUTO_KEY) === "1",
  dismissedVersion: localStorage.getItem(DISMISSED_KEY) ?? "",
  visible: false,
};

let updateRef: Update | null = null;
let started = false;
let installing = false;

function emit(patch: Partial<UpdaterState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function majorOf(version: string): number {
  const match = version.match(/(\d+)\./);
  return match ? Number(match[1]) : 0;
}

function detectBreaking(found: Update, current: string): boolean {
  const majorBump = majorOf(found.version) > majorOf(current || found.currentVersion);
  const notes = (found.body ?? "").toLowerCase();
  const flagged = /\bbreaking\b|💥/.test(notes);
  return majorBump || flagged;
}

async function start() {
  if (started) return;
  started = true;
  try {
    const version = await getVersion();
    emit({ currentVersion: version });
  } catch {
    // En dev el updater puede no estar disponible; seguimos sin version.
  }
  await checkForUpdates(true);
}

async function checkForUpdates(silent: boolean) {
  if (!silent) emit({ status: "checking", error: "" });
  try {
    await updateRef?.close().catch(() => undefined);
    const found = await check();
    updateRef = found;
    if (!found) {
      emit({ status: "uptodate", version: "", body: "", breaking: false, visible: false });
      return;
    }
    const breaking = detectBreaking(found, state.currentVersion);
    const dismissed = state.dismissedVersion === found.version;
    emit({
      status: "available",
      version: found.version,
      body: found.body?.trim() ?? "",
      breaking,
      progress: 0,
      error: "",
      visible: !dismissed,
    });
    // Autodescarga: el usuario no tiene que hacer nada, salvo reiniciar.
    if (state.autoDownload && !dismissed) await install();
  } catch (cause) {
    // Una comprobacion fallida (ej. sin red o en dev) nunca debe molestar.
    emit(silent ? { status: "idle" } : { status: "error", error: messageOf(cause) });
  }
}

async function install() {
  const found = updateRef;
  if (!found || installing) return;
  installing = true;
  emit({ status: "downloading", progress: 0, error: "", visible: true });
  let downloaded = 0;
  let contentLength = 0;
  try {
    await found.downloadAndInstall((event) => {
      if (event.event === "Started") contentLength = event.data.contentLength ?? 0;
      if (event.event === "Progress") {
        downloaded += event.data.chunkLength;
        emit({
          progress: contentLength > 0 ? Math.min(100, Math.round((downloaded / contentLength) * 100)) : 0,
        });
      }
    });
    emit({ status: "installed", progress: 100, visible: true });
  } catch (cause) {
    emit({ status: "error", error: messageOf(cause), visible: true });
  } finally {
    installing = false;
  }
}

function dismiss() {
  if (state.version) localStorage.setItem(DISMISSED_KEY, state.version);
  emit({ visible: false });
}

function setAutoDownload(value: boolean) {
  localStorage.setItem(AUTO_KEY, value ? "1" : "0");
  emit({ autoDownload: value });
  if (value && state.status === "available" && state.dismissedVersion !== state.version) {
    void install();
  }
}

function restart() {
  void relaunch().catch(() => undefined);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  void start();
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return state;
}

export function useUpdater() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export const updater = {
  refresh: () => void checkForUpdates(false),
  install: () => void install(),
  dismiss,
  setAutoDownload,
  restart,
};
