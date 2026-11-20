import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { GripHorizontal, Minimize2, Terminal, Trash2, X } from "lucide-react";
import { useI18n } from "../i18n";
import type { OpLine } from "../lib/types";

export default function DebugConsole({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [lines, setLines] = useState<OpLine[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [position, setPosition] = useState(() => ({
    x: Math.max(12, window.innerWidth - 452),
    y: Math.max(12, window.innerHeight - 300),
  }));
  const drag = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<OpLine>("operation://line", (event) => {
      setLines((previous) => [...previous.slice(-199), event.payload]);
    }).then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, []);

  useEffect(() => {
    const element = logRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [lines]);

  const onMouseDown = (event: React.MouseEvent) => {
    drag.current = { x: event.clientX, y: event.clientY, originX: position.x, originY: position.y };
  };
  const onMouseMove = (event: React.MouseEvent) => {
    if (!drag.current) return;
    const nextX = drag.current.originX + event.clientX - drag.current.x;
    const nextY = drag.current.originY + event.clientY - drag.current.y;
    setPosition({
      x: Math.min(Math.max(4, nextX), window.innerWidth - 300),
      y: Math.min(Math.max(4, nextY), window.innerHeight - 48),
    });
  };
  const stopDrag = () => { drag.current = null; };

  return (
    <div
      className="debug-console"
      style={{ left: position.x, top: position.y }}
      onMouseMove={onMouseMove}
      onMouseUp={stopDrag}
      onMouseLeave={stopDrag}
    >
      <div className="debug-console-head" onMouseDown={onMouseDown}>
        <GripHorizontal size={14} className="shrink-0 text-muted" />
        <Terminal size={13} className="shrink-0 text-accent" />
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium">{t("debug.title")}</span>
        <span className="font-mono text-[9px] text-muted">{lines.length}</span>
        <button className="icon-btn !h-5 !w-5" onClick={() => setLines([])} title={t("common.clear")}>
          <Trash2 size={12} />
        </button>
        <button className="icon-btn !h-5 !w-5" onClick={() => setCollapsed((value) => !value)} title={t("debug.collapse")}>
          <Minimize2 size={12} />
        </button>
        <button className="icon-btn !h-5 !w-5" onClick={onClose} title={t("common.close")}>
          <X size={12} />
        </button>
      </div>
      {!collapsed && (
        <div className="debug-console-body" ref={logRef}>
          {lines.length === 0 ? (
            <p className="text-[11px] text-muted">{t("output.empty")}</p>
          ) : (
            lines.map((line, index) => (
              <div key={index} className={`console-line ${line.stream === "stderr" ? "err" : ""}`}>
                {line.line}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
