import {
  type AssistantMergeConflict,
  assistantAdditiveField,
  assistantMergeConfirmationSchema,
  assistantProposalFields,
  assistantValuesEqual,
} from "@lzc/contracts";
import {
  compileCommonConfiguration,
  type EditorDraft,
  effectiveInput,
  isCommonDraft,
  objectValue,
  readEditorDraft,
} from "@lzc/domain";
import { Check, MessageSquare, Send, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { readAssistantResponse } from "../assistant-stream";
import { t } from "../i18n";
import type { Session } from "./Account";
import {
  type AssistantQuestion,
  AssistantQuestions,
} from "./AssistantQuestions";
import type { ConfigurationBinding } from "./Configurations";
import { labelFor } from "./feature-labels";

type Conversation = {
  id: string;
  revision: number;
  baseRevision: number;
  expiresAt: string;
  stale: boolean;
  messages: { id: string; role: "user" | "assistant"; content: string }[];
  proposal: {
    explanation: string;
    references: string[];
    questions?: (AssistantQuestion & { path: string })[];
    changes: {
      path: string;
      before: unknown;
      value: unknown;
      baselineAvailable?: boolean;
    }[];
  } | null;
};

type Acceptance = {
  revision: number;
  baseRevision: number;
  selectedFields: string[];
  draft: EditorDraft;
  savedDraft: EditorDraft;
};

class MergeConfirmation extends Error {
  constructor(
    readonly conflicts: AssistantMergeConflict[],
    readonly configurationRevision: number,
  ) {
    super("assistant_merge_confirmation_required");
  }
}

const errors: Record<string, string> = {
  assistant_inference_failed:
    "Die Modellantwort konnte nicht sicher verarbeitet werden. Bitte erneut versuchen; deine Anfrage bleibt erhalten und es wurde nichts geändert.",
  assistant_invalid_request:
    "Bitte keine Zugangsdaten senden. Nachricht und Vorschlag müssen innerhalb der erlaubten Grenzen bleiben.",
  assistant_invalid_selection:
    "Diese Feldauswahl passt nicht zur aktuellen Konfiguration. Wähle zusammengehörige Pflichtfelder gemeinsam oder fordere einen zum aktuellen Entwurf passenden Vorschlag an; es wurde nichts geändert.",
  assistant_busy:
    "Alle Chat-Plätze sind belegt. Bitte später erneut versuchen.",
  configuration_changed:
    "Die Konfiguration wurde geändert. Bitte den aktuellen Stand öffnen.",
  assistant_proposal_changed:
    "Der Vorschlag ist nicht mehr aktuell. Bitte das Gespräch neu laden.",
  assistant_proposal_unsupported:
    "Der gespeicherte Vorschlag passt nicht mehr zum aktuellen Konfigurationsvertrag. Bitte stelle deine Frage erneut; Entwurf und Konfiguration bleiben unverändert.",
  assistant_editor_changed:
    "Der Entwurf wurde während der Übernahme geändert. Bitte prüfe die Auswahl und übernimm sie erneut; deine Editoränderungen bleiben erhalten.",
  assistant_conversation_changed:
    "Das Gespräch wurde geändert oder gelöscht. Bitte neu laden.",
  assistant_conversation_full:
    "Dieses Gespräch ist voll. Bitte löschen und ein neues Gespräch beginnen.",
  assistant_knowledge_changed:
    "Der Wissensstand hat sich während der Antwort geändert. Bitte die Nachricht erneut senden; das Gespräch bleibt erhalten.",
  assistant_common_configuration_required:
    "Bitte die Konfiguration zuerst in das aktuelle Editorformat übernehmen.",
  invalid_request_origin_or_csrf:
    "Die Sitzung oder Browser-Adresse passt nicht. Bitte über den lokalen Login-Zugang erneut anmelden.",
};

async function checked(response: Response) {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const confirmation = assistantMergeConfirmationSchema.safeParse(body);
    if (confirmation.success)
      throw new MergeConfirmation(
        confirmation.data.conflicts,
        confirmation.data.configurationRevision,
      );
    throw new Error(
      errors[body.error] ??
        (response.status === 404
          ? "Chat ist in dieser Umgebung noch nicht aktiviert."
          : "Die Anfrage konnte nicht abgeschlossen werden. Konfiguration und Entwurf bleiben unverändert."),
    );
  }
  return response;
}

export function AssistantChat({
  session,
  binding,
  dirty,
  draft,
  savedDraft,
  onAccepted,
}: {
  session: Session;
  binding: ConfigurationBinding | null;
  dirty: boolean;
  draft: EditorDraft;
  savedDraft: EditorDraft | null;
  onAccepted: (
    draft: EditorDraft,
    binding: ConfigurationBinding,
    savedDraft: EditorDraft,
  ) => void;
}) {
  const [open, setOpen] = useState(true);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [previewMessage, setPreviewMessage] = useState("");
  const [selectedPaths, setSelectedPaths] = useState<string[] | null>(null);
  const [confirmation, setConfirmation] = useState<{
    request: Acceptance;
    conflicts: AssistantMergeConflict[];
    configurationRevision: number;
  } | null>(null);
  const [notice, setNotice] = useState("");
  const dialog = useRef<HTMLDialogElement | null>(null);
  const currentDraft = useRef(draft);
  currentDraft.current = draft;
  const lifetime = useRef<AbortController | null>(null);
  const active = useRef(false);
  const messages = useRef<HTMLDivElement | null>(null);
  const endpoint = binding
    ? `/api/v1/configurations/${binding.id}/assistant`
    : null;

  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    if (endpoint && binding?.revision)
      void fetch(endpoint, { signal: controller.signal })
        .then(checked)
        .then((response) => response.json())
        .then((body) => {
          if (!controller.signal.aborted) {
            setConversation(body.conversation);
            setSelectedPaths(null);
          }
        })
        .catch((reason) => {
          if (!controller.signal.aborted) setError(reason.message);
        });
    return () => controller.abort();
  }, [endpoint, binding?.revision]);

  useEffect(() => {
    if (open && (conversation || previewText !== null) && messages.current)
      messages.current.scrollTop = messages.current.scrollHeight;
  }, [conversation, open, previewText]);

  useEffect(() => {
    if (confirmation && dialog.current && !dialog.current.open)
      dialog.current.showModal();
  }, [confirmation]);

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
    void act("send", undefined, next);
  }

  const changes = conversation?.proposal?.changes ?? [];
  const values = isCommonDraft(draft) ? compileCommonConfiguration(draft) : {};
  const fields = assistantProposalFields(changes).filter((field) => {
    const [root, ...keys] = field.changePath.split(".");
    const value = [...keys, ...field.keys].reduce(
      (current, key) => objectValue(current)[key],
      effectiveInput(values, root ?? field.changePath),
    );
    if (
      assistantAdditiveField(field) &&
      Array.isArray(field.value) &&
      Array.isArray(value)
    ) {
      const before = Array.isArray(field.before) ? field.before : [];
      return field.value.some(
        (email) => !before.includes(email) && !value.includes(email),
      );
    }
    return !assistantValuesEqual(value ?? null, field.value ?? null);
  });
  const selected = (selectedPaths ?? fields.map((field) => field.id)).filter(
    (id) => fields.some((field) => field.id === id),
  );

  async function act(
    action: "send" | "accept" | "remove",
    approved?: NonNullable<typeof confirmation>,
    outgoingMessage = message,
  ) {
    if (
      !endpoint ||
      !binding ||
      active.current ||
      lifetime.current?.signal.aborted
    )
      return;
    if (
      action === "accept" &&
      (!conversation || !savedDraft || selected.length === 0)
    )
      return;
    if (
      action === "remove" &&
      !window.confirm("Gespräch und Vorschlag endgültig löschen?")
    )
      return;
    active.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const signal = lifetime.current?.signal;
    const acceptance: Acceptance | null =
      approved?.request ??
      (action === "accept" && conversation && savedDraft
        ? {
            revision: conversation.revision,
            baseRevision: conversation.baseRevision,
            selectedFields: selected,
            draft,
            savedDraft,
          }
        : null);
    if (action === "send") {
      setPreviewMessage(outgoingMessage);
      setPreviewText("");
    }
    try {
      if (
        acceptance &&
        !assistantValuesEqual(currentDraft.current, acceptance.draft)
      )
        throw new Error(errors.assistant_editor_changed);
      const response = await checked(
        await fetch(action === "accept" ? `${endpoint}/accept` : endpoint, {
          method: action === "remove" ? "DELETE" : "POST",
          signal: signal ?? null,
          headers: {
            ...(action !== "remove"
              ? { "Content-Type": "application/json" }
              : {}),
            ...(action === "send" ? { Accept: "application/x-ndjson" } : {}),
            "x-lzc-csrf": session.csrfToken,
          },
          ...(action === "send"
            ? {
                body: JSON.stringify({
                  revision: binding.revision,
                  message: outgoingMessage,
                  draft,
                }),
              }
            : action === "accept"
              ? {
                  body: JSON.stringify({
                    ...acceptance,
                    ...(approved
                      ? { confirmedRevision: approved.configurationRevision }
                      : {}),
                  }),
                }
              : {}),
        }),
      );
      if (signal?.aborted) return;
      if (action === "remove") {
        setConversation(null);
        return;
      }
      if (action === "send") {
        const body = await readAssistantResponse<{
          conversation: Conversation;
        }>(
          response,
          (text) => {
            if (!signal?.aborted) setPreviewText(text);
          },
          checked,
        );
        if (signal?.aborted) return;
        setConversation(body.conversation);
        setSelectedPaths(null);
        setMessage("");
      } else {
        const body = await response.json();
        const configuration = body.configuration;
        if (
          !acceptance ||
          !assistantValuesEqual(currentDraft.current, acceptance.draft)
        )
          throw new Error(errors.assistant_editor_changed);
        const candidate = readEditorDraft(configuration.draft);
        const persisted = readEditorDraft(body.savedConfiguration);
        setConversation(body.conversation);
        setSelectedPaths(null);
        setConfirmation(null);
        onAccepted(
          candidate,
          {
            id: configuration.id,
            revision: configuration.revision,
          },
          persisted,
        );
        setNotice(
          "Ausgewählte Vorschläge sind im lokalen Entwurf übernommen. Noch nicht gespeichert.",
        );
      }
    } catch (reason) {
      if (!signal?.aborted && reason instanceof MergeConfirmation && acceptance)
        setConfirmation({
          request: acceptance,
          conflicts: reason.conflicts,
          configurationRevision: reason.configurationRevision,
        });
      else if (!signal?.aborted)
        setError(
          reason instanceof Error ? reason.message : "Anfrage fehlgeschlagen.",
        );
    } finally {
      active.current = false;
      if (!signal?.aborted) {
        setBusy(false);
        setPreviewText(null);
      }
    }
  }

  return (
    <section className="assistant-chat" aria-label="Konfigurations-Chat">
      <div className="assistant-heading">
        <button
          type="button"
          className="button secondary"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <MessageSquare size={18} aria-hidden="true" /> Konfigurations-Chat
        </button>
        {conversation && (
          <button
            type="button"
            className="button secondary"
            title="Gespräch löschen"
            aria-label="Gespräch löschen"
            disabled={busy}
            onClick={() => void act("remove")}
          >
            <Trash2 size={18} aria-hidden="true" />
          </button>
        )}
      </div>
      {open && (
        <div className="assistant-body">
          {conversation && (
            <p className="muted">
              Gespräch gültig bis{" "}
              {new Date(conversation.expiresAt).toLocaleDateString("de-DE")}
            </p>
          )}
          <div
            ref={messages}
            className="assistant-messages"
            role="log"
            aria-live="polite"
            aria-label="Gespräch"
          >
            {conversation?.messages.map((entry) => (
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
          {(!binding || dirty) && (
            <div role="status">
              <p>
                {t(
                  binding
                    ? "Du hast ungespeicherte Editoränderungen. Chat und Vorschläge arbeiten mit deinem lokalen Entwurf. Speichern bleibt ein separater Schritt."
                    : "Speichere den Entwurf zuerst, damit der Chat mit einer gespeicherten Konfigurationsrevision arbeiten kann.",
                )}
              </p>
              <a className="text-button" href="#configuration-save">
                {t("Zum Speichern")}
              </a>
            </div>
          )}
          {conversation?.proposal && (
            <AssistantQuestions
              key={`${conversation.id}-${conversation.revision}`}
              questions={conversation.proposal.questions ?? []}
              disabled={!binding || busy}
              onReply={sendReply}
            />
          )}
          {conversation?.proposal && fields.length > 0 && (
            <div className="assistant-proposal">
              <h2>Änderungsvorschlag</h2>
              <div className="assistant-diff">
                <table>
                  <thead>
                    <tr>
                      <th>Auswahl</th>
                      <th>Feld</th>
                      <th>{t("Ausgangswert")}</th>
                      <th>Vorschlag</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map((field) => (
                      <tr key={field.id}>
                        <td>
                          <span className="assistant-diff-label">Auswahl</span>
                          <input
                            type="checkbox"
                            aria-label={`${field.path} auswählen`}
                            checked={selected.includes(field.id)}
                            disabled={busy || !!confirmation}
                            onChange={(event) =>
                              setSelectedPaths(
                                event.target.checked
                                  ? [...selected, field.id]
                                  : selected.filter(
                                      (path) => path !== field.id,
                                    ),
                              )
                            }
                          />
                        </td>
                        <td>
                          <span className="assistant-diff-label">Feld</span>
                          <strong>
                            {labelFor(field.keys.at(-1) ?? field.changePath)}
                          </strong>
                          <code>{field.path}</code>
                        </td>
                        <td>
                          <span className="assistant-diff-label">
                            {t("Ausgangswert")}
                          </span>
                          <span>
                            {field.baselineAvailable !== false
                              ? proposalValue(field.before)
                              : t("Nicht mehr verfügbar")}
                          </span>
                        </td>
                        <td>
                          <span className="assistant-diff-label">
                            Vorschlag
                          </span>
                          <span>{proposalValue(field.value)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {conversation.stale && (
                <p role="alert">
                  {t(
                    "Der Vorschlag basiert auf einem älteren Stand. Bei der Übernahme werden die aktuellen Werte geprüft; nur tatsächliche Konflikte benötigen deine Bestätigung.",
                  )}
                </p>
              )}
              <p role="status">
                {t("{{selected}} von {{total}} Feldern ausgewählt.", {
                  selected: selected.length,
                  total: fields.length,
                })}{" "}
                {t("Nicht ausgewählte Vorschläge bleiben für später erhalten.")}
              </p>
              <button
                type="button"
                className="button secondary"
                disabled={
                  busy || !!confirmation || !savedDraft || selected.length === 0
                }
                onClick={() => void act("accept")}
              >
                <Check size={18} aria-hidden="true" />{" "}
                {t(
                  selected.length === fields.length
                    ? "Gesamten Vorschlag übernehmen"
                    : "Ausgewählte Felder übernehmen",
                )}
              </button>
            </div>
          )}
          <p className="muted">
            {t(
              "Vorschläge werden nur in den lokalen Entwurf übernommen. Erst „Konfiguration speichern“ speichert die Änderungen. Keine Cloud-Ausführung.",
            )}
          </p>
          {notice && <p role="status">{t(notice)}</p>}
          {error && <p role="alert">{error}</p>}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void act("send");
            }}
          >
            <label htmlFor="assistant-message">Deine Nachricht</label>
            <div className="assistant-compose">
              <textarea
                id="assistant-message"
                rows={3}
                maxLength={4000}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Was soll diese Umgebung leisten?"
                disabled={!binding || busy || !!confirmation}
              />
              <button
                type="submit"
                className="button primary"
                aria-label="Nachricht senden"
                title="Nachricht senden"
                disabled={!binding || busy || !!confirmation || !message.trim()}
              >
                <Send size={18} aria-hidden="true" />
              </button>
            </div>
            {busy && <p role="status">Anfrage läuft…</p>}
          </form>
        </div>
      )}
      {confirmation && (
        <dialog
          ref={dialog}
          className="assistant-conflicts"
          aria-labelledby="assistant-conflicts-title"
          onCancel={(event) => {
            event.preventDefault();
            setConfirmation(null);
          }}
        >
          <h2 id="assistant-conflicts-title">
            {t("Zwischenzeitliche Änderungen prüfen")}
          </h2>
          <p>
            {t(
              "Einige Ausgangswerte wurden inzwischen geändert. Möchtest du die folgenden Werte trotzdem in deinen lokalen Entwurf übernehmen? Es wird noch nichts gespeichert.",
            )}
          </p>
          {confirmation.conflicts.length === 0 && (
            <p>
              {t(
                "Die gespeicherte Revision hat sich erneut geändert. Bitte prüfe den aktuellen Abgleich und bestätige nochmals.",
              )}
            </p>
          )}
          <ul>
            {confirmation.conflicts.map((conflict) => (
              <li key={`${conflict.kind}:${conflict.path}`}>
                <code>{conflict.path}</code>
                {conflict.kind === "editor" ? (
                  <p>
                    {t(
                      "Deine manuelle Editoränderung überschreibt eine zwischenzeitlich gespeicherte Änderung. Inhalte geschützter Felder werden hier nicht angezeigt.",
                    )}
                  </p>
                ) : (
                  <>
                    <p>
                      {t("Aktuell: {{value0}}", {
                        value0: proposalValue(conflict.current),
                      })}
                    </p>
                    <p>
                      {t("Vorschlag: {{value0}}", {
                        value0: proposalValue(conflict.value),
                      })}
                    </p>
                    {!conflict.baselineAvailable && (
                      <p>
                        {t(
                          "Der ursprüngliche Ausgangswert dieses älteren Vorschlags ist nicht mehr verfügbar. Bitte prüfe die Werte ausdrücklich.",
                        )}
                      </p>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
          <div className="button-row">
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => setConfirmation(null)}
            >
              {t("Abbrechen")}
            </button>
            <button
              type="button"
              className="button primary"
              disabled={busy}
              onClick={() => void act("accept", confirmation)}
            >
              {t("Trotzdem in Entwurf übernehmen")}
            </button>
          </div>
          {error && <p role="alert">{t(error)}</p>}
        </dialog>
      )}
    </section>
  );
}

function proposalValue(value: unknown): string {
  if (value == null) return t("Nicht gesetzt");
  if (Array.isArray(value)) return value.map(proposalValue).join(", ");
  if (typeof value === "boolean") return t(value ? "Ja" : "Nein");
  return String(value);
}
