import { useI18n } from "../i18n";
import type { CreatePackInput, LoaderVersion, McVersion } from "../lib/types";
import CreatePackForm from "./CreatePackForm";

type Props = {
  form: CreatePackInput;
  onChange: (next: CreatePackInput) => void;
  onSubmit: (event: React.FormEvent) => void;
  mcVersions: McVersion[];
  loaderVersions: LoaderVersion[];
  packwizFound: boolean;
  busy: boolean;
  workspace: string;
};

export default function WelcomeView(props: Props) {
  const { t } = useI18n();

  const features = [
    { number: "01", title: t("welcome.feature1Title"), body: t("welcome.feature1Body") },
    { number: "02", title: t("welcome.feature2Title"), body: t("welcome.feature2Body") },
    { number: "03", title: t("welcome.feature3Title"), body: t("welcome.feature3Body") },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <div className="grid min-h-[calc(100vh-11rem)] grid-cols-[1.05fr_0.95fr] items-center gap-14 py-6">
        <section>
          <div className="flex items-center gap-3">
            <span className="h-px w-8 bg-accent" />
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
              {t("welcome.eyebrow")}
            </span>
          </div>

          <h1 className="mt-7 max-w-lg text-[44px] font-semibold leading-[1.06] tracking-[-0.045em]">
            {t("welcome.title")}
          </h1>

          <p className="mt-6 max-w-md text-[15px] leading-7 text-muted">
            {t("welcome.subtitle")}
          </p>

          <div className="mt-11 flex flex-col gap-5">
            {features.map((feature) => (
              <div key={feature.number} className="flex gap-4">
                <span className="mt-0.5 font-mono text-[11px] text-accent">{feature.number}</span>
                <div>
                  <p className="text-sm font-medium">{feature.title}</p>
                  <p className="mt-1 text-[13px] leading-5 text-muted">{feature.body}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-12 flex flex-wrap items-center gap-3 border-t border-line pt-5 text-xs text-muted">
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${props.packwizFound ? "bg-ok" : "bg-bad"}`} />
            <span>{props.packwizFound ? t("workspace.ready") : t("workspace.notReady")}</span>
            <span className="h-3 w-px bg-line" />
            <span className="text-[10px] uppercase tracking-wide">{t("workspace.label")}</span>
            <span className="max-w-[220px] truncate font-mono text-[11px]">{props.workspace}</span>
          </div>
        </section>

        <section className="card p-7">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold tracking-tight">{t("welcome.cardTitle")}</h2>
            <span className="font-mono text-[10px] text-muted">01 / 01</span>
          </div>
          <p className="mt-1 text-sm text-muted">{t("welcome.cardSubtitle")}</p>
          <div className="mt-6">
            <CreatePackForm
              form={props.form}
              onChange={props.onChange}
              onSubmit={props.onSubmit}
              mcVersions={props.mcVersions}
              loaderVersions={props.loaderVersions}
              packwizFound={props.packwizFound}
              busy={props.busy}
              compact
            />
          </div>
          <p className="mt-6 border-t border-line pt-4 text-[11px] text-muted">{t("welcome.local")}</p>
        </section>
      </div>
    </div>
  );
}
