import { useI18n } from "../i18n";
import type { OpLine } from "../lib/types";

type Props = {
  lines: OpLine[];
  onClear: () => void;
};

export default function OutputPanel({ lines, onClear }: Props) {
  const { t } = useI18n();
  if (lines.length === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface shadow-lg">
      <div className="mx-auto max-w-5xl px-6 py-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-muted">{t("output.title")}</span>
          <button className="text-xs text-muted hover:text-ink" onClick={onClear}>
            {t("output.clear")}
          </button>
        </div>
        <div className="max-h-28 overflow-auto">
          {lines.map((line, index) => (
            <div key={index} className={`output-line ${line.stream === "stderr" ? "err" : ""}`}>
              {line.line}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
