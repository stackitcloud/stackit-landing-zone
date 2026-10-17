import {
  type PlanOutput,
  planOutputEventSchema,
  planOutputSchema,
} from "@lzc/contracts";

const invalidOutput = () =>
  new Error("Die OpenTofu-Ausgabe konnte nicht bestätigt werden.");

export async function readPlanOutput(
  response: Response,
  update: (output: PlanOutput) => void,
) {
  function accept(output: PlanOutput) {
    if (new TextEncoder().encode(output.text).byteLength > 2 * 1024 * 1024)
      throw invalidOutput();
    update(output);
  }
  if (!response.headers.get("content-type")?.includes("application/x-ndjson")) {
    const result = planOutputSchema.safeParse(await response.json());
    if (!result.success) throw invalidOutput();
    accept(result.data);
    return result.data.kind;
  }
  if (!response.body) throw invalidOutput();
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let pending = "";
  let kind: PlanOutput["kind"] | undefined;
  let complete = false;
  try {
    while (!complete) {
      const { done, value } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      if (pending.length > 13 * 1024 * 1024) throw invalidOutput();
      let newline = pending.indexOf("\n");
      while (newline !== -1) {
        const line = pending.slice(0, newline);
        pending = pending.slice(newline + 1);
        let raw: unknown;
        try {
          raw = JSON.parse(line);
        } catch (error) {
          if (!(error instanceof SyntaxError)) throw error;
          throw invalidOutput();
        }
        const event = planOutputEventSchema.safeParse(raw);
        if (!event.success || complete) throw invalidOutput();
        if (event.data.type === "output") {
          accept(event.data.data);
          kind = event.data.data.kind;
        } else if (event.data.type === "error")
          throw new Error(
            event.data.error === "authentication_required"
              ? "Bitte erneut anmelden."
              : event.data.error === "credential_role_required" ||
                  event.data.error === "plan_not_found"
                ? "Keine Berechtigung für diese Ausgabe."
                : "Die OpenTofu-Ausgabe ist momentan nicht verfügbar.",
          );
        else if (event.data.type === "complete") complete = true;
        newline = pending.indexOf("\n");
      }
    }
    if (!complete || !kind || pending || decoder.decode())
      throw invalidOutput();
    return kind;
  } finally {
    try {
      await reader.cancel();
    } finally {
      reader.releaseLock();
    }
  }
}
