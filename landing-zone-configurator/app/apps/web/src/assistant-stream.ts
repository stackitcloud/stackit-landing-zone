export async function readAssistantResponse<Result>(
  response: Response,
  onText: (text: string) => void,
  checked: (response: Response) => Promise<Response>,
): Promise<Result> {
  if (!response.headers.get("content-type")?.includes("application/x-ndjson"))
    return response.json();
  if (!response.body) throw new Error("Antwortstream fehlt.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let size = 0;
  let completed = false;
  let result: Result | undefined;
  async function consume(line: string) {
    if (!line.trim()) return;
    if (completed) throw new Error("Unerwartete Daten nach dem Abschluss.");
    const event = JSON.parse(line);
    if (
      event.type === "text" &&
      typeof event.text === "string" &&
      event.text.length <= 3000
    )
      onText(event.text);
    else if (
      event.type === "complete" &&
      event.data &&
      typeof event.data === "object"
    ) {
      result = event.data;
      completed = true;
    } else if (event.type === "error" && typeof event.error === "string") {
      await checked(
        new Response(JSON.stringify({ error: event.error }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        }),
      );
      throw new Error("Antwortstream fehlgeschlagen.");
    } else throw new Error("Ungueltiger Antwortstream.");
  }
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > 1048576) throw new Error("Antwortstream ist zu gross.");
      pending += decoder.decode(next.value, { stream: true });
      let boundary = pending.indexOf("\n");
      while (boundary >= 0) {
        await consume(pending.slice(0, boundary));
        pending = pending.slice(boundary + 1);
        boundary = pending.indexOf("\n");
      }
    }
    pending += decoder.decode();
    if (pending.trim()) await consume(pending);
    if (!completed || result === undefined)
      throw new Error(
        "Antwort wurde unterbrochen. Bitte erneut versuchen; es wurde kein Vorschlag uebernommen.",
      );
    return result;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
