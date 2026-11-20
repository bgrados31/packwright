import { useI18n } from "../i18n";
import { LOADERS, type CreatePackInput, type LoaderVersion, type McVersion } from "../lib/types";
import Select from "./Select";

type Props = {
  form: CreatePackInput;
  onChange: (next: CreatePackInput) => void;
  onSubmit: (event: React.FormEvent) => void;
  mcVersions: McVersion[];
  loaderVersions: LoaderVersion[];
  packwizFound: boolean;
  busy: boolean;
  compact?: boolean;
  availableLoaders: string[];
};

export default function CreatePackForm({
  form,
  onChange,
  onSubmit,
  mcVersions,
  loaderVersions,
  packwizFound,
  busy,
  compact = false,
  availableLoaders,
}: Props) {
  const { t } = useI18n();
  const patch = (values: Partial<CreatePackInput>) => onChange({ ...form, ...values });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="pack-name" className="text-xs font-medium text-muted">{t("form.name")}</label>
        <input
          id="pack-name"
          className="field"
          value={form.name}
          onChange={(event) => patch({ name: event.target.value })}
          placeholder={t("form.namePlaceholder")}
          required
          autoFocus={compact}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pack-mc" className="text-xs font-medium text-muted">{t("form.minecraft")}</label>
          {mcVersions.length > 0 ? (
            <Select
              id="pack-mc"
              value={form.minecraft_version}
              onChange={(value) => patch({ minecraft_version: value, loaderVersion: null })}
              searchable
              searchPlaceholder={t("form.search")}
              emptyLabel={t("form.noResults")}
              options={mcVersions.map((version) => ({
                value: version.id,
                label: version.id,
                badge: version.latest ? t("form.latest") : undefined,
              }))}
            />
          ) : (
            <input
              id="pack-mc"
              className="field"
              value={form.minecraft_version}
              onChange={(event) => patch({ minecraft_version: event.target.value })}
              placeholder="1.21.1"
              required
            />
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="pack-loader" className="text-xs font-medium text-muted">{t("form.loader")}</label>
          <Select
            id="pack-loader"
            value={form.loader}
            onChange={(value) => patch({ loader: value, loaderVersion: null })}
            options={LOADERS.filter((loader) => availableLoaders.includes(loader)).map((loader) => ({ value: loader, label: loader }))}
          />
        </div>
      </div>

      <p className="-mt-1 text-[11px] leading-4 text-muted">{t("form.autoHint")}</p>

      <details className="group text-sm">
        <summary className="flex items-center gap-1.5 py-1 text-xs text-muted transition-colors hover:text-ink">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="transition-transform group-open:rotate-90"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
          {t("form.more")}
        </summary>

        <div className="mt-3 flex flex-col gap-4 rounded-lg border border-line bg-subtle p-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="pack-author" className="text-xs text-muted">{t("form.author")}</label>
              <input
                id="pack-author"
                className="field"
                value={form.author}
                onChange={(event) => patch({ author: event.target.value })}
                placeholder={t("form.authorPlaceholder")}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="pack-version" className="text-xs text-muted">{t("form.version")}</label>
              <input
                id="pack-version"
                className="field"
                value={form.version}
                onChange={(event) => patch({ version: event.target.value })}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="pack-lv" className="text-xs text-muted">{t("form.loaderVersion")}</label>
            {loaderVersions.length > 0 ? (
              <Select
                id="pack-lv"
                value={form.loaderVersion ?? ""}
                onChange={(value) => patch({ loaderVersion: value || null })}
                searchable
                searchPlaceholder={t("form.search")}
                emptyLabel={t("form.noResults")}
                options={[
                  { value: "", label: t("form.loaderAuto") },
                  ...loaderVersions.map((version) => ({
                    value: version.id,
                    label: version.id,
                    badge: version.stable ? undefined : t("form.unstable"),
                  })),
                ]}
              />
            ) : (
              <input
                id="pack-lv"
                className="field"
                value={form.loaderVersion ?? ""}
                onChange={(event) => patch({ loaderVersion: event.target.value })}
                placeholder={t("form.loaderAuto")}
              />
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="pack-desc" className="text-xs text-muted">{t("form.description")}</label>
            <textarea
              id="pack-desc"
              className="field resize-y"
              rows={2}
              value={form.description}
              onChange={(event) => patch({ description: event.target.value })}
              placeholder={t("form.descriptionPlaceholder")}
            />
          </div>
        </div>
      </details>

      <button className="btn btn-primary mt-1" type="submit" disabled={busy || !packwizFound}>
        {busy ? t("form.creating") : t("form.submit")}
      </button>

      {!packwizFound && <p className="text-center text-xs text-bad">{t("form.packwizMissing")}</p>}
    </form>
  );
}
