import type { S3BackendDescriptor } from "@lzc/contracts";
import { useEffect, useState } from "react";
import { t } from "../i18n";
import type { Session } from "./Account";

type Backend = { id: string; descriptor: S3BackendDescriptor };
const messages: Record<string, string> = {
  invalid_backend_request: "Die Backend-Angaben sind ungültig.",
  backend_already_registered: "Dieses Backend ist bereits registriert.",
  backend_read_failed:
    "Der S3-State ist nicht lesbar. Prüfe Zugang und Berechtigungen.",
  platform_engineer_required:
    "Backend-Verwaltung erfordert die Rolle Platform Engineer.",
};

export function StateBackends({
  session,
  configurationId,
  value,
  onChange,
  onReady,
}: {
  session: Session;
  configurationId: string | null;
  value: string;
  onChange: (id: string) => void;
  onReady: (ready: boolean) => void;
}) {
  const [backends, setBackends] = useState<Backend[]>([]);
  const [bound, setBound] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [bucket, setBucket] = useState("");
  const [key, setKey] = useState("terraform.tfstate");
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    onReady(false);
    setError("");
    void (async () => {
      const response = await fetch("/api/v1/backends", {
        credentials: "same-origin",
        signal: controller.signal,
      });
      if (!response.ok)
        throw new Error("State-Backends konnten nicht geladen werden.");
      const data = (await response.json()) as { backends: Backend[] };
      let binding: Backend | null = null;
      if (configurationId) {
        const source = await fetch(
          `/api/v1/backends?configurationId=${encodeURIComponent(configurationId)}`,
          { credentials: "same-origin", signal: controller.signal },
        );
        if (source.ok) binding = (await source.json()) as Backend;
        else {
          const failure = await source.json();
          if (source.status !== 404 || failure.error !== "backend_not_found")
            throw new Error(
              "Die State-Zuordnung konnte nicht bestätigt werden.",
            );
        }
      }
      if (controller.signal.aborted) return;
      setBackends(
        binding && !data.backends.some((item) => item.id === binding.id)
          ? [binding, ...data.backends]
          : data.backends,
      );
      setBound(binding?.id ?? null);
      onChange(binding?.id ?? "");
      onReady(true);
      if (revision > 0) setNotice("State-Zuordnung aktualisiert.");
    })().catch((failure: unknown) => {
      if (!controller.signal.aborted)
        setError(
          failure instanceof Error
            ? failure.message
            : "State-Prüfung fehlgeschlagen.",
        );
    });
    return () => controller.abort();
  }, [configurationId, revision, onChange, onReady]);

  async function register(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/v1/backends", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-LZC-CSRF": session.csrfToken,
        },
        body: JSON.stringify({
          descriptor: {
            bucket: bucket.trim(),
            key,
            endpoint: "https://object.storage.eu01.onstackit.cloud",
            region: "eu01",
            useLockfile: true,
          },
          credentials: { accessKeyId, secretAccessKey },
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          messages[result.error] ??
            "Das Backend konnte nicht registriert werden.",
        );
      setBackends((current) => [result, ...current]);
      if (!bound) onChange(result.id);
      setAccessKeyId("");
      setSecretAccessKey("");
      setNotice(
        "S3-Backend registriert. Es wurde kein Plan oder Apply ausgeführt.",
      );
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Registrierung fehlgeschlagen.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function download(id: string) {
    setError("");
    try {
      const response = await fetch(
        `/api/v1/backends/${encodeURIComponent(id)}/configuration`,
        { credentials: "same-origin" },
      );
      if (!response.ok)
        throw new Error("Die Backenddatei konnte nicht geladen werden.");
      const data = (await response.json()) as { configuration: string };
      const url = URL.createObjectURL(
        new Blob([data.configuration], { type: "application/json" }),
      );
      try {
        const link = document.createElement("a");
        link.href = url;
        link.download = "backend.tf.json";
        link.click();
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Download fehlgeschlagen.",
      );
    }
  }

  return (
    <section>
      <h3>{t("State-Backend")}</h3>
      {configurationId && (
        <div className="field">
          <label htmlFor="deployment-backend">
            {t("Backend der Landing Zone")}
          </label>
          <select
            id="deployment-backend"
            value={value}
            disabled={busy || Boolean(bound)}
            onChange={(event) => onChange(event.target.value)}
          >
            <option value="">
              {t("Accelerator-Standard · Management-S3")}
            </option>
            {backends.map((backend) => (
              <option key={backend.id} value={backend.id}>
                {backend.descriptor.bucket} / {backend.descriptor.key}
              </option>
            ))}
          </select>
        </div>
      )}
      {!bound && !value && (
        <dl className="summary-list">
          <dt>{t("Backend")}</dt>
          <dd>{t("Accelerator-Standard")}</dd>
          <dt>{t("Bucket")}</dt>
          <dd>{t("Management-State-Bucket · Anlage im ersten Apply")}</dd>
          <dt>{t("State-Key")}</dt>
          <dd>terraform.tfstate</dd>
          <dt>{t("Region")}</dt>
          <dd>eu01</dd>
          <dt>{t("Zugang")}</dt>
          <dd>
            {t(
              "Ausgewählter Service Account · S3-Zugang aus Management Secrets Manager",
            )}
          </dd>
          <dt>{t("State-Migration")}</dt>
          <dd>{t("Automatisch nach erfolgreichem Bootstrap-Apply")}</dd>
        </dl>
      )}
      <button
        type="button"
        className="text-button"
        disabled={busy}
        onClick={() => setRevision((current) => current + 1)}
      >
        {t("State-Zuordnung aktualisieren")}
      </button>
      <details className="technical">
        <summary>{t("Bestehendes S3-Backend registrieren")}</summary>
        <form onSubmit={(event) => void register(event)}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="state-bucket">{t("Bucket")}</label>
              <input
                id="state-bucket"
                required
                minLength={3}
                maxLength={63}
                value={bucket}
                disabled={busy}
                onChange={(event) => setBucket(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="state-key">{t("State-Key")}</label>
              <input
                id="state-key"
                required
                maxLength={1024}
                value={key}
                disabled={busy}
                onChange={(event) => setKey(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="state-access-key">{t("S3 Access Key")}</label>
              <input
                id="state-access-key"
                type="password"
                autoComplete="new-password"
                required
                value={accessKeyId}
                disabled={busy}
                onChange={(event) => setAccessKeyId(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="state-secret-key">
                {t("S3 Secret Access Key")}
              </label>
              <input
                id="state-secret-key"
                type="password"
                autoComplete="new-password"
                required
                value={secretAccessKey}
                disabled={busy}
                onChange={(event) => setSecretAccessKey(event.target.value)}
              />
            </div>
          </div>
          <dl className="summary-list">
            <dt>{t("Endpoint")}</dt>
            <dd className="credential-account">
              https://object.storage.eu01.onstackit.cloud
            </dd>
            <dt>{t("Region")}</dt>
            <dd>eu01</dd>
            <dt>{t("State-Locking")}</dt>
            <dd>{t("S3-Lockfile")}</dd>
          </dl>
          <button type="submit" className="button secondary" disabled={busy}>
            {t("Backend registrieren")}
          </button>
        </form>
        {backends.map((backend) => (
          <div key={backend.id}>
            <p className="credential-account">
              {backend.descriptor.bucket} / {backend.descriptor.key}
            </p>
            <button
              type="button"
              className="text-button"
              onClick={() => void download(backend.id)}
            >
              {t("Backenddatei herunterladen")}
              <span className="sr-only">
                : {backend.descriptor.bucket} / {backend.descriptor.key}
              </span>
            </button>
          </div>
        ))}
      </details>
      {notice && (
        <p role="status" className="success-banner">
          {t(notice)}
        </p>
      )}
      {error && (
        <p role="alert" className="validation-box">
          {t(error)}
        </p>
      )}
    </section>
  );
}
