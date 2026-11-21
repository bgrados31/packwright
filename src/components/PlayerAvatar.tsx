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
  // Guardamos la clave junto a la imagen para no mostrar el avatar del
  // jugador anterior cuando cambia el prop `name`.
  const [avatar, setAvatar] = useState(() => ({ key, src: cache.get(key) ?? null }));
  const src = avatar.key === key ? avatar.src : cache.get(key) ?? null;

  useEffect(() => {
    if (src || cache.has(key)) return;
    let cancelled = false;
    invoke<string>("player_avatar", { player: name })
      .then((data) => {
        cache.set(key, data);
        if (!cancelled) setAvatar({ key, src: data });
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
