import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type Props = {
  name: string;
  size?: number;
  className?: string;
};

const cache = new Map<string, string>();

export default function PlayerAvatar({ name, size = 28, className = "" }: Props) {
  const key = name.toLowerCase();
  const [src, setSrc] = useState<string | null>(cache.get(key) ?? null);

  useEffect(() => {
    if (src || cache.has(key)) return;
    let cancelled = false;
    invoke<string>("player_avatar", { player: name })
      .then((data) => {
        cache.set(key, data);
        if (!cancelled) setSrc(data);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [name, key, src]);

  if (src) {
    return <img src={src} alt={name} width={size} height={size} className={`player-avatar ${className}`} />;
  }
  return (
    <span
      className={`player-avatar player-avatar-fallback ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(10, size / 2.6) }}
      title={name}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
