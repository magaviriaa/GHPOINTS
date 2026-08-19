import { getCreditStrategy, listAppConfig } from "@/server/config/app-config";
import { getAllowedEmailDomains, getEnv } from "@/server/config/env";
import { adminSaveConfigAction } from "@/server/actions/admin";
import { ClientForm, SubmitButton } from "@/components/forms/client-form";
import { Field, NativeSelect } from "@/components/ui/field";
import { CREDIT_STRATEGY, optionsOf } from "@/lib/labels";
import { SectionHeader } from "@/components/ui-blocks";

export default async function AdminSettingsPage() {
  const [strategy, config] = await Promise.all([getCreditStrategy(), listAppConfig()]);
  const env = getEnv();

  return (
    <div className="space-y-8">
      <SectionHeader as="h1" title="Configuración" />

      <section className="rounded-xl border bg-card p-4">
        <h2 className="font-display font-bold">Cómo se acredita a los comités</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Define qué pasa cuando alguien pertenece a más de un comité. Cambia el cálculo de
          participación de aquí en adelante; no reescribe lo ya cerrado.
        </p>
        <ClientForm
          action={adminSaveConfigAction}
          className="mt-4 max-w-md space-y-4"
          successMessage="Configuración guardada."
        >
          <Field
            label="Estrategia multicomité"
            htmlFor="committee_credit_strategy"
            hint={CREDIT_STRATEGY[strategy]?.hint}
          >
            <NativeSelect
              id="committee_credit_strategy"
              name="committee_credit_strategy"
              defaultValue={strategy}
            >
              {optionsOf(CREDIT_STRATEGY).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <SubmitButton pendingLabel="Guardando…">Guardar</SubmitButton>
        </ClientForm>
      </section>

      <section className="rounded-xl border bg-card p-4">
        <h2 className="font-display font-bold">Entorno</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Solo lectura: se cambia con variables de entorno, no desde la app.
        </p>
        <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="text-muted-foreground">Dominios</dt>
          <dd className="font-mono text-xs sm:text-sm">
            {getAllowedEmailDomains().join(", ")}
          </dd>
          <dt className="text-muted-foreground">Zona horaria</dt>
          <dd className="font-mono text-xs sm:text-sm">{env.APP_TIMEZONE}</dd>
          <dt className="text-muted-foreground">URL de la app</dt>
          <dd className="font-mono text-xs sm:text-sm">{env.APP_URL}</dd>
          <dt className="text-muted-foreground">Correo</dt>
          <dd>{env.RESEND_API_KEY ? "Resend" : "Consola (desarrollo)"}</dd>
          <dt className="text-muted-foreground">Config persistida</dt>
          <dd className="font-mono text-xs sm:text-sm">
            {config.map((row) => row.key).join(", ") || "ninguna"}
          </dd>
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">Los secretos no se muestran.</p>
      </section>
    </div>
  );
}
