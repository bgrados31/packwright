import { Layers, Sparkles, X } from "lucide-react";
import { useI18n } from "../i18n";
import { PACK_PROFILES, type PackProfile } from "../lib/profiles";

type Props = {
  onClose: () => void;
  onPick: (profile: PackProfile) => void;
};

export default function ProfileModal({ onClose, onPick }: Props) {
  const { t } = useI18n();

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t("profiles.title")}>
      <div className="modal-card" style={{ maxWidth: 620 }}>
        <div className="modal-header">
          <span className="modal-icon running"><Layers size={18} /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">{t("profiles.title")}</h2>
            <p className="text-[11px] text-muted">{t("profiles.subtitle")}</p>
          </div>
          <button className="icon-btn" onClick={onClose} title={t("common.close")}><X size={16} /></button>
        </div>

        <div className="grid gap-2 p-4 sm:grid-cols-3">
          {PACK_PROFILES.map((profile) => (
            <button
              key={profile.id}
              className="export-platform !flex-col !items-start"
              onClick={() => onPick(profile)}
            >
              <Sparkles size={16} className="text-accent" />
              <span className="block text-[13px] font-semibold">{profile.name}</span>
              <span className="block text-[11px] leading-4 text-muted">{profile.description}</span>
              <span className="mt-auto pt-2 font-mono text-[10px] text-accent">
                {profile.mods.length} mods · {profile.loader}
              </span>
            </button>
          ))}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>{t("common.close")}</button>
        </div>
      </div>
    </div>
  );
}
