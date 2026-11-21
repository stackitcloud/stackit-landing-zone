export type AssistantUpstreamCause =
  | "grammar_backend_mismatch"
  | "unsupported_schema"
  | "context_limit"
  | "rate_limit"
  | "unknown";

/** Classify a bounded provider error in memory; never return its private text. */
export async function assistantUpstreamCause(
  response: Response,
): Promise<AssistantUpstreamCause> {
  if (!response.body) return "unknown";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > 16384) return "unknown";
      chunks.push(next.value);
    }
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const error = parsed?.error;
    if (!error || typeof error !== "object" || Array.isArray(error))
      return "unknown";
    const text = [error.code, error.type, error.message]
      .filter((value): value is string => typeof value === "string")
      .join(" ")
      .slice(0, 8192);
    if (
      /context_length_exceeded|maximum context length|context window/i.test(
        text,
      )
    )
      return "context_limit";
    if (/rate_limit_exceeded|rate limit|too many requests/i.test(text))
      return "rate_limit";
    if (
      /xgrammar|guidance|structured.output.backend/i.test(text) &&
      /mismatch|not support|unsupported|incompatib|fallback/i.test(text)
    )
      return "grammar_backend_mismatch";
    if (
      /schema/i.test(text) &&
      /unsupported|not supported|invalid schema/i.test(text)
    )
      return "unsupported_schema";
    return "unknown";
  } catch {
    return "unknown";
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
