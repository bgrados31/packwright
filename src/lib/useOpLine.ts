import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import type { OpLine } from "./types";

/**
 * Suscripción segura a `operation://line`.
 * El flag `cancelled` evita listeners huérfanos si el componente se desmonta
 * antes de que resuelva `listen()` (causa clásica de líneas duplicadas).
 */
export function useOpLine(onLine: (line: OpLine) => void, deps: unknown[] = []) {
  const callback = useRef(onLine);
  callback.current = onLine;

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    listen<OpLine>("operation://line", (event) => {
      if (!cancelled) callback.current(event.payload);
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
