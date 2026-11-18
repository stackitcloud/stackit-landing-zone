export function resolveAssistantLanguage(
  preference: "de" | "en" | undefined,
  history: { role: "user" | "assistant"; content: string }[],
  message: string,
): "de" | "en" {
  if (preference) return preference;
  const sources = [
    message,
    ...history
      .filter((entry) => entry.role === "user")
      .map((entry) => entry.content)
      .reverse(),
  ];
  for (const source of sources) {
    const answer =
      source.split(/(?:My answer|Meine Antwort)\s*:\s*/i).at(-1) ?? source;
    if (
      /(?:answer|reply|respond|antworte|antworten).{0,30}(?:english|englisch)/i.test(
        answer,
      )
    )
      return "en";
    if (
      /(?:answer|reply|respond|antworte|antworten).{0,30}(?:german|deutsch)/i.test(
        answer,
      )
    )
      return "de";
    const german =
      answer.match(
        /\b(?:bitte|welche\w*|wie|ich|wir|möchte\w*|nutze\w*|nimm|hinzufügen|ändern|konfigurieren|sollen|besteller|ordner|gespeichert|entwurf|keine\w*|unsere\w*)\b/gi,
      )?.length ?? 0;
    const english =
      answer.match(
        /\b(?:please|which|what|how|i|we|use|add|change|configure|should|could|would|here|company|our|choose|keep|retain|let|need)\b/gi,
      )?.length ?? 0;
    if (german || english) return german >= english ? "de" : "en";
  }
  return "de";
}
