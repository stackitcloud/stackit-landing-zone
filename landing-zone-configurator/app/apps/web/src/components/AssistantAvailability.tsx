import { type ReactNode, useEffect, useState } from "react";
import { t } from "../i18n";

export function AssistantAvailability({ children }: { children: ReactNode }) {
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/auth/status", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Assistant status unavailable");
        const status = await response.json();
        if (!controller.signal.aborted)
          setAvailable(status.assistant !== false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setAvailable(false);
      });
    return () => controller.abort();
  }, []);
  if (available === null) return null;
  if (available) return children;
  return (
    <section className="panel" role="status">
      <p>
        {t(
          "Der Assistant ist in dieser Umgebung deaktiviert. Du kannst Vorlagen und den Editor weiterhin verwenden. Gespeicherte Gespräche und Vorschläge bleiben erhalten.",
        )}
      </p>
    </section>
  );
}
