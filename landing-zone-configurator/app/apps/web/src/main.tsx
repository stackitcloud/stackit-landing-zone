import { healthResponseSchema } from "@lzc/contracts";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

function App() {
  const [status, setStatus] = useState("Verbindung wird geprüft …");
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/healthz", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("API unavailable");
        healthResponseSchema.parse(await response.json());
        setStatus("API erreichbar");
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("API nicht erreichbar");
      });
    return () => controller.abort();
  }, []);

  return (
    <main>
      <p className="eyebrow">STACKIT · Entwicklungsstand</p>
      <h1>Landing Zone Configurator</h1>
      <p>Landing Zones aus Vorlagen gestalten, überprüfen und bereitstellen.</p>
      <section aria-labelledby="foundation">
        <h2 id="foundation">Die Grundlage steht</h2>
        <p role="status">{status}</p>
        <p>
          Anmeldung, Template-Editor und Deployments werden als Nächstes
          ergänzt.
        </p>
      </section>
    </main>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing root element");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
