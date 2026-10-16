import {
  type AssistantFailureReason,
  assistantInferenceFailureSchema,
} from "@lzc/contracts";
import { t } from "./i18n";

const messages: Record<AssistantFailureReason, string> = {
  requirements_unconfirmed:
    "Die Modellantwort hat Angaben vorausgesetzt, die durch deine Aussagen nicht bestätigt sind. Bitte nenne die gewünschte Änderung konkret oder nutze den Editor.",
  proposal_invalid:
    "Der Modellvorschlag passt nicht zu den unterstützten Feldern oder ihren Abhängigkeiten. Bitte ändere die betroffenen Felder im Editor oder frage nach den unterstützten Einstellungen.",
  response_invalid:
    "Das Modell hat keine gültige strukturierte Antwort geliefert. Du kannst die Anfrage erneut senden oder im Editor weiterarbeiten.",
  response_truncated:
    "Die Modellantwort wurde wegen ihrer Länge abgeschnitten. Bitte frage nach einer einzelnen Komponente oder weniger Änderungen gleichzeitig.",
  response_interrupted:
    "Die Verbindung zur Modellantwort wurde unterbrochen. Bitte sende die Anfrage erneut.",
  service_timeout:
    "Der Chatdienst hat nicht rechtzeitig geantwortet. Bitte sende die Anfrage erneut.",
  service_busy:
    "Der Chatdienst ist ausgelastet. Bitte versuche es später erneut.",
  service_authentication:
    "Der Chatdienst kann sich nicht beim Modelldienst anmelden. Die Betreiber müssen den Dienstzugang prüfen; du kannst im Editor weiterarbeiten.",
  service_unavailable:
    "Der Chatdienst ist derzeit nicht verfügbar. Bitte versuche es später erneut oder arbeite im Editor weiter.",
};

export function assistantFailureMessage(body: unknown): string | null {
  const result = assistantInferenceFailureSchema.safeParse(body);
  if (!result.success) return null;
  return [
    t(messages[result.data.reason]),
    t(
      "Es wurde nichts geändert. Deine Nachricht und Antwortauswahl bleiben erhalten.",
    ),
    t("Diagnosekennung: {{requestId}}", { requestId: result.data.requestId }),
  ].join(" ");
}
