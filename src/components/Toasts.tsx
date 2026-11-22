import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, X, XCircle } from "lucide-react";
import { useI18n } from "../i18n";

export type Toast = {
  id: string;
  title: string;
  detail?: string;
  state: "running" | "success" | "error";
  /** Auto-dismiss delay in ms. Running toasts never expire on their own. */
  duration?: number;
};

type Props = {
  items: Toast[];
  onDismiss: (id: string) => void;
};

function ToastCard({ item, onDismiss }: { item: Toast; onDismiss: (id: string) => void }) {
  const { t } = useI18n();
  // Running toasts stay until the operation finishes; only terminal states expire.
  const duration = item.state === "running" ? 0 : (item.duration ?? 4000);
  const remaining = useRef(duration);
  const started = useRef(0);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  const [paused, setPaused] = useState(false);
  const [delay, setDelay] = useState(0);

  useEffect(() => { remaining.current = duration; setDelay(0); }, [duration]);

  useEffect(() => {
    if (!duration || paused) return;
    started.current = Date.now();
    const timer = window.setTimeout(() => dismissRef.current(item.id), remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - started.current));
    };
  }, [item.id, item.state, duration, paused]);

  const pause = () => setPaused(true);
  const resume = () => {
    setDelay(Math.max(0, duration - remaining.current));
    setPaused(false);
  };

  return (
    <div
      className={`toast ${item.state}`}
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocus={pause}
      onBlur={resume}
    >
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
      {duration > 0 && (
        <span
          key={`${item.id}-${item.state}`}
          className="toast-progress"
          style={{
            animationDuration: `${duration}ms`,
            animationDelay: `-${delay}ms`,
            animationPlayState: paused ? "paused" : "running",
          }}
        />
      )}
    </div>
  );
}

export default function Toasts({ items, onDismiss }: Props) {
  const { t } = useI18n();
  if (items.length === 0) return null;

  return (
    <div className="toast-stack" role="region" aria-label={t("toasts.notifications")} aria-live="polite">
      {items.map((item) => (
        <ToastCard key={item.id} item={item} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
