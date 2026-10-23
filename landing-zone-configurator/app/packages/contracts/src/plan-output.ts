import { z } from "zod";

export const planOutputSchema = z.strictObject({
  text: z.string().max(2 * 1024 * 1024),
  truncated: z.boolean(),
  kind: z.enum(["live", "execution", "saved-plan"]),
});
export type PlanOutput = z.infer<typeof planOutputSchema>;
export const planOutputEventSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("output"), data: planOutputSchema }),
  z.strictObject({ type: z.literal("heartbeat") }),
  z.strictObject({ type: z.literal("complete") }),
  z.strictObject({
    type: z.literal("error"),
    error: z.string().min(1).max(128),
  }),
]);

const nativeEventSchema = z.object({
  type: z.string(),
  "@message": z.string(),
  ui: z.string().optional(),
});
export function openTofuProgress(content: string) {
  let version = false;
  let invalid = false;
  const messages: string[] = [];
  for (const line of content.split("\n")) {
    if (!line) continue;
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      invalid = true;
      continue;
    }
    const event = nativeEventSchema.safeParse(raw);
    if (!event.success) {
      invalid = true;
      continue;
    }
    if (event.data.type === "version")
      version = /^1\.\d+$/.test(event.data.ui ?? "");
    if (!version) {
      invalid = true;
      continue;
    }
    if (event.data.type !== "outputs") messages.push(event.data["@message"]);
    if (event.data.type === "diagnostic") {
      const diagnostic = z
        .object({ diagnostic: z.object({ detail: z.string() }) })
        .safeParse(raw);
      const detail = diagnostic.success
        ? diagnostic.data.diagnostic.detail
        : "";
      if (detail.trim() && !event.data["@message"].includes(detail))
        messages.push(detail);
    }
  }
  if (invalid) messages.push("[OpenTofu progress event unavailable]");
  return { text: `${messages.join("\n")}\n`, invalid };
}
