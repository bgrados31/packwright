import { useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft, Eraser, Terminal } from "lucide-react";
import { useI18n } from "../i18n";
import type { OpLine } from "../lib/types";

type Props = {
  lines: OpLine[];
  onSend: (command: string) => Promise<void> | void;
  running: boolean;
  height?: number;
  onClear: () => void;
};

const SUGGESTIONS: Array<[string, string]> = [
  ["help", "List all commands"],
  ["list", "Players online"],
  ["say <message>", "Broadcast a message"],
  ["stop", "Stop the server"],
  ["save-all", "Save the world now"],
  ["save-on", "Enable autosave"],
  ["save-off", "Disable autosave"],
  ["whitelist add <player>", "Add to whitelist"],
  ["whitelist remove <player>", "Remove from whitelist"],
  ["whitelist list", "Show whitelist"],
  ["op <player>", "Grant operator"],
  ["deop <player>", "Revoke operator"],
  ["gamemode survival <player>", "Change game mode"],
  ["time set day", "Set the time"],
  ["weather clear", "Clear the weather"],
  ["difficulty normal", "Change difficulty"],
  ["tps", "Ticks per second"],
  ["seed", "Show world seed"],
  ["plugins", "List plugins"],
];

export default function ConsolePanel({ lines, onSend, running, height = 320, onClear }: Props) {
  const { t } = useI18n();
  const [command, setCommand] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [showHints, setShowHints] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const hints = useMemo(() => {
    const term = command.trim().toLowerCase();
    if (!term) return [];
    return SUGGESTIONS.filter(([name, hint]) => name.toLowerCase().includes(term) || hint.toLowerCase().includes(term)).slice(0, 6);
  }, [command]);

  useEffect(() => {
    const element = boxRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [lines]);

  const send = async () => {
    const value = command.trim();
    if (!value) return;
    setHistory((current) => [value, ...current].slice(0, 30));
    setHistoryIndex(-1);
    setCommand("");
    setShowHints(false);
    await onSend(value);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void send();
    } else if (event.key === "Tab" && hints.length > 0) {
      event.preventDefault();
      setCommand(hints[0][0]);
      setShowHints(false);
    } else if (event.key === "ArrowUp" && history.length > 0) {
      event.preventDefault();
      const next = Math.min(historyIndex + 1, history.length - 1);
      setHistoryIndex(next);
      setCommand(history[next]);
    } else if (event.key === "ArrowDown" && historyIndex >= 0) {
      event.preventDefault();
      const next = historyIndex - 1;
      setHistoryIndex(next);
      setCommand(next >= 0 ? history[next] : "");
    } else if (event.key === "Escape") {
      setShowHints(false);
    }
  };

  return (
    <div className={`console-panel ${running ? "live" : ""}`}>
      <div className="console-head">
        <span className="console-head-title"><Terminal size={13} /> {t("servers.console")}</span>
        <span className="console-head-state">
          <span className={`console-status-dot ${running ? "on" : ""}`} />
          {running ? t("console.live") : t("console.offline")}
        </span>
        <span className="console-head-count">{lines.length} {t("console.lines")}</span>
        <span className="flex-1" />
        <button className="icon-btn !h-6 !w-6" onClick={onClear} title={t("console.clear")}><Eraser size={12} /></button>
        <span className="console-hint-key">{t("console.tabHint")}</span>
      </div>

      <div className="console-box console-body" ref={boxRef} style={{ height }}>
        {lines.length === 0 ? (
          <p className="text-[11px] text-muted">{t("output.empty")}</p>
        ) : (
          lines.map((line, index) => (
            <div
              key={index}
              className={`console-line ${line.stream === "stderr" ? "err" : ""} ${line.stream === "command" ? "cmd" : ""}`}
            >
              {line.line}
            </div>
          ))
        )}
      </div>

      <div className="console-compose">
        {showHints && hints.length > 0 && (
          <div className="console-suggest">
            {hints.map(([name, hint]) => (
              <button
                key={name}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => { setCommand(name); setShowHints(false); inputRef.current?.focus(); }}
              >
                <span className="font-mono text-[11px] text-accent">{name}</span>
                <span className="text-[10px] text-muted">{hint}</span>
              </button>
            ))}
          </div>
        )}
        <input
          ref={inputRef}
          className="field font-mono text-[12px]"
          value={command}
          onChange={(event) => { setCommand(event.target.value); setShowHints(true); }}
          onFocus={() => setShowHints(true)}
          onBlur={() => window.setTimeout(() => setShowHints(false), 120)}
          onKeyDown={onKeyDown}
          placeholder={running ? t("console.placeholder") : t("console.offlineHint")}
          disabled={!running}
          spellCheck={false}
        />
        <button className="btn btn-primary shrink-0" disabled={!running || !command.trim()} onClick={() => void send()}>
          <CornerDownLeft size={13} /> {t("servers.send")}
        </button>
      </div>
    </div>
  );
}
