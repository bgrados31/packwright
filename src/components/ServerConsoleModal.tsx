import { invoke } from "@tauri-apps/api/core";
import { Terminal, X } from "lucide-react";
import { useI18n } from "../i18n";
import type { OpLine, ServerInfo } from "../lib/types";
import ConsolePanel from "./ConsolePanel";

type Props = {
  server: ServerInfo;
  lines: OpLine[];
  running: boolean;
  playerNames: string[];
  onClose: () => void;
  onClear: () => void;
  onAppend: (line: OpLine) => void;
};

function messageOf(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

export default function ServerConsoleModal({ server, lines, running, playerNames, onClose, onClear, onAppend }: Props) {
  const { t } = useI18n();

  const send = async (command: string) => {
    try {
      await invoke("server_send", { name: server.name, command });
    } catch (cause) {
      onAppend({
        id: `error-${Date.now()}`,
        stream: "stderr",
        line: messageOf(cause),
      });
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t("servers.console")}>
      <div className="modal-card" style={{ maxWidth: 640 }}>
        <div className="modal-header">
          <span className="modal-icon running"><Terminal size={18} /></span>
          <div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">{server.name}</h2><p className="text-[11px] text-muted">{t("servers.console")}</p></div>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="p-4">
          <ConsolePanel
            lines={lines}
            running={running}
            height={260}
            playerNames={playerNames}
            onClear={onClear}
            onSend={send}
          />
          <p className="mt-2 text-[10px] text-muted">{t("servers.commandHint")}</p>
        </div>
      </div>
    </div>
  );
}
