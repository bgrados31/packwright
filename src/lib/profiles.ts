export type ProfileMod = { id: string; name: string };

export type PackProfile = {
  id: string;
  name: string;
  description: string;
  loader: string;
  mods: ProfileMod[];
};

export const PACK_PROFILES: PackProfile[] = [
  {
    id: "performance",
    name: "Performance",
    description: "Sodium, Lithium, Iris y ImmediatelyFast para FPS estables.",
    loader: "fabric",
    mods: [
      { id: "AANobbMI", name: "Sodium" },
      { id: "gvQqBUqZ", name: "Lithium" },
      { id: "fQF3v6pz", name: "Iris Shaders" },
      { id: "j6pERJDY", name: "ImmediatelyFast" },
    ],
  },
  {
    id: "vanilla-plus",
    name: "Vanilla+",
    description: "JEI y Jade: utilidades esenciales sin cambiar el juego.",
    loader: "fabric",
    mods: [
      { id: "u6dRKJwZ", name: "JEI" },
      { id: "X57dCSwF", name: "Jade" },
    ],
  },
  {
    id: "kitchen-sink",
    name: "Kitchen sink",
    description: "Rendimiento, utilidades y herramientas para servidores grandes.",
    loader: "fabric",
    mods: [
      { id: "AANobbMI", name: "Sodium" },
      { id: "gvQqBUqZ", name: "Lithium" },
      { id: "fQF3v6pz", name: "Iris Shaders" },
      { id: "j6pERJDY", name: "ImmediatelyFast" },
      { id: "u6dRKJwZ", name: "JEI" },
      { id: "X57dCSwF", name: "Jade" },
      { id: "OvKDWylU", name: "Shulker Box Tooltip" },
    ],
  },
];
