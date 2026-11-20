import { useI18n, type TranslationKey } from "../i18n";

export const LAUNCHERS: Array<{ value: string; label: TranslationKey; glyph: string }> = [
  { value: "atlauncher", label: "launcher.atlauncher", glyph: "A" },
  { value: "prism", label: "launcher.prism", glyph: "P" },
  { value: "modrinth", label: "launcher.modrinth", glyph: "M" },
  { value: "multimc", label: "launcher.multimc", glyph: "Mc" },
];

type Props = {
  launchers: string[];
  paths: Record<string, string>;
  defaults: Record<string, string>;
  onChange: (launchers: string[], paths: Record<string, string>) => void;
  onBrowse: (key: string) => void;
  picking: string | null;
};

export default function LauncherPicker({ launchers, paths, defaults, onChange, onBrowse, picking }: Props) {
  const { t } = useI18n();

  const toggle = (value: string) => {
    const active = launchers.includes(value);
    const nextLaunchers = active
      ? launchers.filter((item) => item !== value)
      : [...launchers, value];
    const nextPaths = { ...paths };
    if (!active && !nextPaths[value] && defaults[value]) nextPaths[value] = defaults[value];
    onChange(nextLaunchers, nextPaths);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        {LAUNCHERS.map((launcher) => {
          const active = launchers.includes(launcher.value);
          return (
            <button
              key={launcher.value}
              className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${
                active ? "border-accent bg-accent-soft" : "border-line bg-surface hover:border-accent/40"
              }`}
              onClick={() => toggle(launcher.value)}
            >
              <span
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-semibold ${active ? "bg-accent text-white" : "bg-subtle text-muted"}`}
              >
                {launcher.glyph}
              </span>
              <span className="text-sm font-medium">{t(launcher.label)}</span>
              <span className={`ml-auto h-2 w-2 rounded-full ${active ? "bg-accent" : "border border-line"}`} />
            </button>
          );
        })}
      </div>

      {launchers.length > 0 && (
        <div className="flex flex-col gap-3 border-t border-line pt-4">
          {launchers.map((value) => {
            const meta = LAUNCHERS.find((item) => item.value === value);
            return (
              <div key={value} className="flex flex-col gap-1.5">
                <span className="text-xs text-muted">
                  {t("setup.launcherPath", { name: meta ? t(meta.label) : value })}
                  {defaults[value] && <span className="ml-2 text-[10px] text-accent">· {t("setup.detected")}</span>}
                </span>
                <div className="flex gap-2">
                  <input
                    className="field font-mono text-xs"
                    value={paths[value] ?? ""}
                    onChange={(event) => onChange(launchers, { ...paths, [value]: event.target.value })}
                    spellCheck={false}
                  />
                  <button className="btn btn-secondary shrink-0" onClick={() => onBrowse(value)} disabled={picking !== null}>
                    {picking === value ? "…" : t("setup.browse")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
