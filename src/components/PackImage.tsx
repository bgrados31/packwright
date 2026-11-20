import { useEffect, useState, type CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";

type Props = {
  dir: string;
  path: string | null | undefined;
  className?: string;
  style?: CSSProperties;
  alt?: string;
  fallback?: string;
};

const cache = new Map<string, string>();

export function clearImageCache(dir?: string) {
  if (!dir) {
    cache.clear();
    return;
  }
  const prefix = `${dir}::`;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

/** Imagen de un pack cargada desde el backend como data URL, con caché en memoria. */
export default function PackImage({
  dir,
  path,
  className = "",
  style,
  alt = "",
  fallback = "/packwright-mark.png",
}: Props) {
  const key = path ? `${dir}::${path}` : "";
  const [src, setSrc] = useState<string | null>(() => (key ? cache.get(key) ?? null : null));

  useEffect(() => {
    if (!key || !path) {
      setSrc(null);
      return;
    }
    const cached = cache.get(key);
    if (cached) {
      setSrc(cached);
      return;
    }
    let cancelled = false;
    invoke<string>("pack_image_get", { dir, path })
      .then((url) => {
        cache.set(key, url);
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [dir, path, key]);

  return <img src={src ?? fallback} alt={alt} className={className} style={style} />;
}
