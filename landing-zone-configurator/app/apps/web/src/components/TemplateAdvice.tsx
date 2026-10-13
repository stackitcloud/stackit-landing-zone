import { MessageSquare, Send, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { readAssistantResponse } from "../assistant-stream";
import { t } from "../i18n";
import { describe, templates } from "../templates";
import type { Session } from "./Account";
import {
  type AssistantQuestion,
  AssistantQuestions,
} from "./AssistantQuestions";

type Advice = {
  id: string;
  expiresAt: string;
  stale: boolean;
  messages: { id: string; role: string; content: string }[];
  recommendation: {
    templateId: string | null;
    explanation: string;
    questions: (AssistantQuestion | string)[];
  } | null;
};
const endpoint = "/api/v1/configurations/template-advice";
async function checked(response: Response) {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const messages: Record<string, string> = {
      assistant_invalid_request:
        "Bitte keine Zugangsdaten senden. Die Nachricht darf höchstens 4000 Zeichen enthalten.",
      assistant_busy:
        "Die Beratung ist ausgelastet. Bitte später erneut versuchen.",
      assistant_inference_failed:
        "Die Modellantwort konnte nicht sicher verarbeitet werden. Bitte versuche die Anfrage erneut; es wurde keine Empfehlung übernommen.",
      authentication_required:
        "Die Anmeldung ist abgelaufen. Bitte erneut mit STACKIT anmelden.",
      configuration_access_denied:
        "Für die Template-Beratung sind aktuelle Plattformrechte erforderlich.",
      assistant_conversation_full:
        "Das Gespräch ist voll. Bitte löschen und neu beginnen.",
      assistant_conversation_changed:
        "Das Gespräch wurde geändert. Bitte die Seite neu laden.",
      invalid_request_origin_or_csrf:
        "Bitte über den lokalen Login-Zugang erneut anmelden.",
    };
    throw new Error(
      messages[body.error] ??
        "Die Template-Beratung ist derzeit nicht verfügbar. Du kannst weiterhin eine Vorlage aus der Liste wählen.",
    );
  }
  return response;
}

export function TemplateAdvice({
  session,
  onChoose,
}: {
  session: Session;
  onChoose: (id: string) => void;
}) {
  const [advice, setAdvice] = useState<Advice | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [previewMessage, setPreviewMessage] = useState("");
  const lifetime = useRef<AbortController | null>(null);
  const active = useRef(false);
  const messages = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    void fetch(endpoint, { signal: controller.signal })
      .then(checked)
      .then((response) => response.json())
      .then((body) => {
        if (!controller.signal.aborted) setAdvice(body.advice);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason.message);
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if ((advice || previewText !== null) && messages.current)
      messages.current.scrollTop = messages.current.scrollHeight;
  }, [advice, previewText]);

  async function act(remove: boolean, outgoingMessage = message) {
    const controller = lifetime.current;
    if (!controller || controller.signal.aborted || active.current) return;
    if (
      remove &&
      !window.confirm("Template-Beratung und Empfehlung endgültig löschen?")
    )
      return;
    active.current = true;
    setBusy(true);
    setError("");
    if (!remove) {
      setPreviewMessage(outgoingMessage);
      setPreviewText("");
    }
    try {
      const response = await checked(
        await fetch(endpoint, {
          method: remove ? "DELETE" : "POST",
          signal: controller.signal,
          headers: {
            "x-lzc-csrf": session.csrfToken,
            ...(!remove ? { "Content-Type": "application/json" } : {}),
            ...(!remove ? { Accept: "application/x-ndjson" } : {}),
          },
          ...(!remove
            ? { body: JSON.stringify({ message: outgoingMessage }) }
            : {}),
        }),
      );
      const body = remove
        ? null
        : await readAssistantResponse<{ advice: Advice }>(
            response,
            (text) => {
              if (!controller.signal.aborted) setPreviewText(text);
            },
            checked,
          );
      if (controller.signal.aborted) return;
      setAdvice(body?.advice ?? null);
      if (!remove) setMessage("");
    } catch (reason) {
      if (!controller.signal.aborted)
        setError(
          reason instanceof Error ? reason.message : "Beratung fehlgeschlagen.",
        );
    } finally {
      active.current = false;
      if (!controller.signal.aborted) {
        setBusy(false);
        setPreviewText(null);
      }
    }
  }
  const recommended = templates.find(
    (template) => template.id === advice?.recommendation?.templateId,
  );
  function sendReply(reply: string) {
    const next = [message.trim(), reply].filter(Boolean).join("\n\n");
    if (next.length > 4000) {
      setError(
        t(
          "Die Antwort ist zu lang. Bitte kürze deine Nachricht oder beantworte weniger Fragen gemeinsam.",
        ),
      );
      return;
    }
    void act(false, next);
  }
  return (
    <section className="assistant-chat" aria-label="Template-Beratung">
      <div className="assistant-heading">
        <h2>
          <MessageSquare size={18} aria-hidden="true" /> Template-Beratung
        </h2>
        {advice && (
          <button
            type="button"
            className="button secondary"
            aria-label="Template-Beratung löschen"
            title="Template-Beratung löschen"
            disabled={busy}
            onClick={() => void act(true)}
          >
            <Trash2 size={18} aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="assistant-body">
        <div
          ref={messages}
          className="assistant-messages"
          role="log"
          aria-live="polite"
          aria-label="Template-Gespräch"
        >
          {advice?.messages.map((entry) => (
            <div className={`assistant-message ${entry.role}`} key={entry.id}>
              <strong>{entry.role === "user" ? "Du" : "Assistent"}</strong>
              <p>{entry.content}</p>
            </div>
          ))}
          {previewText !== null && (
            <>
              <div className="assistant-message user">
                <strong>Du</strong>
                <p>{previewMessage}</p>
              </div>
              <div className="assistant-message assistant">
                <strong>Assistent</strong>
                <p>{previewText || "Antwort wird vorbereitet…"}</p>
                <small>Vorläufig · Antwort wird geprüft</small>
              </div>
            </>
          )}
        </div>
        {advice?.recommendation && !advice.stale && (
          <AssistantQuestions
            key={`${advice.id}-${advice.messages.length}`}
            questions={advice.recommendation.questions ?? []}
            disabled={busy}
            onReply={sendReply}
          />
        )}
        {recommended && (
          <div className="assistant-proposal">
            <h3>Empfehlung: {describe(recommended).title}</h3>
            <p>{describe(recommended).description}</p>
            <button
              type="button"
              className="button secondary"
              disabled={busy || advice?.stale}
              onClick={() => onChoose(recommended.id)}
            >
              Vorlage ansehen
            </button>
          </div>
        )}
        {advice?.stale && (
          <p role="alert">
            Der Vorlagenstand wurde geändert. Bitte die Empfehlung erneut prüfen
            lassen.
          </p>
        )}
        {error && <p role="alert">{error}</p>}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void act(false);
          }}
        >
          <label htmlFor="template-advice-message">
            Welche Umgebung brauchst du?
          </label>
          <div className="assistant-compose">
            <textarea
              id="template-advice-message"
              rows={3}
              maxLength={4000}
              placeholder="Zum Beispiel: Zwei Teams, öffentliche APIs und eine gemeinsame Verbindung ins Unternehmensnetz."
              value={message}
              disabled={busy}
              onChange={(event) => setMessage(event.target.value)}
            />
            <button
              type="submit"
              className="button primary"
              title="Anfrage senden"
              aria-label="Template-Anfrage senden"
              disabled={busy || !message.trim()}
            >
              <Send size={18} aria-hidden="true" />
            </button>
          </div>
          {busy && <p role="status">Beratung läuft…</p>}
        </form>
      </div>
    </section>
  );
}
