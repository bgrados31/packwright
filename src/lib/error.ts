/** Extrae el mensaje de un error de Tauri/JS de forma segura. */
export function messageOf(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

/**
 * Acción secundaria (abrir carpeta, copiar al portapapeles…) donde un fallo no
 * debe interrumpir el flujo ni generar un `unhandledrejection`.
 */
export function fireAndForget(promise: Promise<unknown>): void {
  void promise.catch(() => undefined);
}
