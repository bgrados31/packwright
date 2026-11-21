import { CheckCircle2, Loader2, X, XCircle } from "lucide-react";
import { useI18n } from "../i18n";

export type Toast = {
  id: string;
  title: string;
  detail?: string;
  state: "running" | "success" | "error";
};

type Props = {
  items: Toast[];
  onDismiss: (id: string) => void;
};

export default function Toasts({ items, onDismiss }: Props) {
  const { t } = useI18n();
  if (items.length === 0) return null;

  return (
    <div className="toast-stack">
      {items.map((item) => (
        <div key={item.id} className={`toast ${item.state}`}>
          <span className="toast-icon">
            {item.state === "running" ? (
              <Loader2 size={15} className="spin" />
            ) : item.state === "success" ? (
              <CheckCircle2 size={15} />
            ) : (
              <XCircle size={15} />
            )}
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[12px] font-medium leading-4">{item.title}</p>
            {item.detail && <p className="mt-0.5 truncate text-[10px] leading-3 opacity-70">{item.detail}</p>}
          </div>
          {item.state !== "running" && (
            <button className="icon-btn" onClick={() => onDismiss(item.id)} title={t("common.close")} aria-label={t("common.close")}>
              <X size={13} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
