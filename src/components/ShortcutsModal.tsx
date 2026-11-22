import { Keyboard, X } from "lucide-react";
import { useI18n, type TranslationKey } from "../i18n";
import { onBackdropClick, useDialogKeyboard } from "../lib/useDialog";

type Shortcut = { keys: string[]; label: TranslationKey };
type Group = { title: TranslationKey; items: Shortcut[] };

const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? "⌘" : "Ctrl";

const GROUPS: Group[] = [
  {
    title: "shortcuts.groupGeneral",
    items: [
      { keys: [MOD, "K"], label: "shortcuts.commandPalette" },
      { keys: ["?"], label: "shortcuts.help" },
      { keys: [MOD, "N"], label: "shortcuts.newPack" },
    ],
  },
  {
    title: "shortcuts.groupNavigate",
    items: [
      { keys: [MOD, "1"], label: "shortcuts.home" },
      { keys: [MOD, "2"], label: "shortcuts.modpacks" },
      { keys: [MOD, "3"], label: "shortcuts.servers" },
      { keys: [MOD, "4"], label: "shortcuts.settings" },
      { keys: [MOD, "5"], label: "shortcuts.launcher" },
    ],
  },
  {
    title: "shortcuts.groupEditor",
    items: [{ keys: [MOD, "S"], label: "shortcuts.save" }],
  },
];

export default function ShortcutsModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  useDialogKeyboard(onClose);

  return (
    <div
      className="modal-backdrop"
      onClick={onBackdropClick(onClose)}
      role="dialog"
      aria-modal="true"
      aria-label={t("shortcuts.title")}
    >
      <div className="modal-card shortcuts-modal">
        <div className="modal-header">
          <span className="modal-icon running"><Keyboard size={18} /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">{t("shortcuts.title")}</h2>
            <p className="text-[11px] text-muted">{t("shortcuts.subtitle")}</p>
          </div>
          <button className="icon-btn" onClick={onClose} title={t("common.close")} aria-label={t("common.close")}>
            <X size={16} />
          </button>
        </div>

        <div className="shortcuts-body">
          {GROUPS.map((group) => (
            <section key={group.title} className="shortcuts-group">
              <h3 className="shortcuts-group-title">{t(group.title)}</h3>
              <div className="shortcuts-list">
                {group.items.map((item) => (
                  <div key={item.label} className="shortcut-row">
                    <span className="shortcut-label">{t(item.label)}</span>
                    <span className="shortcut-keys">
                      {item.keys.map((key, index) => <kbd key={`${key}-${index}`}>{key}</kbd>)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="modal-footer shortcuts-footer">
          <span>{t("shortcuts.hint")} <kbd>?</kbd></span>
          <button className="btn btn-secondary" onClick={onClose}>{t("common.close")}</button>
        </div>
      </div>
    </div>
  );
}
