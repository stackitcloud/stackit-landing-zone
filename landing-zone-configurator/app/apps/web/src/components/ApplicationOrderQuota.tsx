import {
  type applicationOrderQuotaSchema,
  applicationOrderQuotaUpdateSchema,
} from "@lzc/contracts";
import { useState } from "react";
import type { z } from "zod";
import { formatMessage, t } from "../i18n";

type Quota = z.infer<typeof applicationOrderQuotaSchema>;
export function ApplicationOrderQuota({
  quota,
  canManage,
  onSave,
}: {
  quota: Quota;
  canManage: boolean;
  onSave: (
    input: z.infer<typeof applicationOrderQuotaUpdateSchema>,
  ) => Promise<void>;
}) {
  return (
    <section
      className="application-order-quota"
      aria-label={t("Bestellkontingent")}
    >
      <h3>{t("Bestellkontingent")}</h3>
      <p>
        {t(
          formatMessage(
            "Reservierte Bestellungen: {{value0}} · Grenze: {{value1}}",
            {
              value0: String(quota.reservedOrders),
              value1:
                quota.maxReservedOrders === null
                  ? t("Unbegrenzt")
                  : String(quota.maxReservedOrders),
            },
          ),
        )}
      </p>
      <p>
        {t(
          "Das Kontingent gilt für den gesamten Arbeitsbereich, nicht für einzelne Benutzer oder Cloud-Ressourcen. Bestellungen reservieren einen Platz. Archivierung gibt ihn frei, wenn noch kein Apply gestartet wurde oder ein erfolgreicher Destroy nachgewiesen ist. Archivierte fehlgeschlagene oder teilweise ausgeführte Applies zählen weiter.",
        )}
      </p>
      {canManage && (
        <details>
          <summary>{t("Bestellkontingent verwalten")}</summary>
          <QuotaForm key={quota.revision} quota={quota} onSave={onSave} />
        </details>
      )}
    </section>
  );
}

function QuotaForm({
  quota,
  onSave,
}: {
  quota: Quota;
  onSave: (
    input: z.infer<typeof applicationOrderQuotaUpdateSchema>,
  ) => Promise<void>;
}) {
  const [unlimited, setUnlimited] = useState(quota.maxReservedOrders === null);
  const [limit, setLimit] = useState(String(quota.maxReservedOrders ?? ""));
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = applicationOrderQuotaUpdateSchema.safeParse({
    maxReservedOrders: unlimited
      ? null
      : limit.trim() === ""
        ? undefined
        : Number(limit),
    expectedRevision: quota.revision,
    confirmQuota: confirmed,
  });
  return (
    <form
      className="project-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!request.success || busy) return;
        setBusy(true);
        setError("");
        try {
          await onSave(request.data);
        } catch {
          setError(
            "Das Bestellkontingent konnte nicht gespeichert werden. Bitte neu laden und erneut prüfen.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="toggle-label">
        <input
          type="checkbox"
          checked={unlimited}
          disabled={busy}
          onChange={(event) => {
            setUnlimited(event.target.checked);
            setConfirmed(false);
          }}
        />
        {t("Unbegrenzte Bestellungen erlauben")}
      </label>
      {!unlimited && (
        <label>
          {t("Maximal reservierte Bestellungen (0–1000000)")}
          <input
            type="number"
            min="0"
            max="1000000"
            step="1"
            value={limit}
            disabled={busy}
            onChange={(event) => {
              setLimit(event.target.value);
              setConfirmed(false);
            }}
          />
        </label>
      )}
      <p>
        {t(
          "0 sperrt neue Bestellungen. Eine niedrigere Grenze verändert oder widerruft keine bestehende Bestellung; ihre weiteren Pläne und Applies bleiben möglich.",
        )}
      </p>
      <label className="toggle-label">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={busy}
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        {t("Dieses Kontingent für neue Bestellungen bestätigen")}
      </label>
      <button
        type="submit"
        className="button"
        disabled={busy || !request.success}
      >
        {t("Bestellkontingent speichern")}
      </button>
      {error && <p role="alert">{t(error)}</p>}
    </form>
  );
}
