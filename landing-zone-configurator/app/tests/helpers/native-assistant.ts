/** Test fixtures express logical operations; the wire is the real native
 * OpenAI function/tool protocol, not a JSON-action transport fallback. */
export function nativeStepResponse(step: unknown, model = "test-model") {
  const value = step as Record<string, unknown>;
  const reads: Record<string, string> = {
    configuration: "read_configuration",
    knowledge: "read_knowledge",
    default: "read_native_default",
    catalogue: "read_catalogue",
  };
  const calls =
    value.action === "inspect"
      ? (value.requests as Record<string, unknown>[]).map(
          ({ tool, ...arguments_ }) => ({
            name: reads[String(tool)]!,
            arguments: arguments_,
          }),
        )
      : value.action === "answer" &&
          Array.isArray(value.questions) &&
          value.questions.length
        ? value.questions.map((question: Record<string, unknown>) => ({
            name: "ask_question",
            arguments: {
              ...Object.fromEntries(
                Object.entries(value).filter(
                  ([key]) => !["action", "kind", "questions"].includes(key),
                ),
              ),
              ...question,
            },
          }))
        : [
            {
              name:
                value.action === "validate_proposal"
                  ? "validate_proposal"
                  : "send_answer",
              arguments: Object.fromEntries(
                Object.entries(value).filter(
                  ([key]) =>
                    key !== "action" &&
                    (value.action !== "answer" || key !== "questions"),
                ),
              ),
            },
          ];
  for (const call of calls)
    if (call.name === "validate_proposal") {
      call.arguments.nativeDefaults = call.arguments.basis ?? [];
      delete call.arguments.basis;
    }
  return {
    model,
    choices: [
      {
        finish_reason: "tool_calls",
        message: {
          role: "assistant",
          content: null,
          tool_calls: calls.map((call, index) => ({
            id: `call-${Math.random().toString(16).slice(2)}-${index}`,
            type: "function",
            function: {
              name: call.name,
              arguments: JSON.stringify(call.arguments),
            },
          })),
        },
      },
    ],
  };
}

export function logicalFixtureRequest(raw: {
  messages: { role: string; content: string | null }[];
}) {
  const server = raw.messages.find(
    (message) =>
      message.role === "user" &&
      message.content?.startsWith(
        "Server context (data, not user decisions):\n",
      ),
  );
  const context = JSON.parse(server!.content!.split("\n").slice(1).join("\n"));
  const system = raw.messages.find((message) => message.role === "system")!
    .content!;
  context.knowledge = JSON.parse(
    system.split("\nReviewed knowledge:\n")[1]!.split("\n")[0]!,
  );
  context.turns = raw.messages
    .filter((message) =>
      /^Conversation turn \d+:\n/.test(message.content ?? ""),
    )
    .map((message) => ({
      role: message.role,
      index: Number(message.content!.match(/^Conversation turn (\d+)/)![1]),
      content: message.content!.replace(/^Conversation turn \d+:\n/, ""),
    }));
  context.request = context.turns.at(-1)?.content;
  const messages = [
    { role: "system", content: system },
    { role: "user", content: JSON.stringify(context) },
  ];
  const pending: { role: string; content: string | null }[] = [];
  for (
    let index = raw.messages.length - 1;
    index >= 0 && raw.messages[index]!.role === "tool";
    index--
  )
    pending.unshift(raw.messages[index]!);
  if (pending.length) {
    const results = pending.map((message) => {
      const callId = (message as { tool_call_id?: string }).tool_call_id;
      const calls = raw.messages.flatMap(
        (entry) =>
          (
            entry as {
              tool_calls?: {
                id: string;
                function: { name: string; arguments: string };
              }[];
            }
          ).tool_calls ?? [],
      );
      const call = calls.find((entry) => entry.id === callId);
      const kind: Record<string, string> = {
        read_configuration: "configuration",
        read_knowledge: "knowledge",
        read_native_default: "default",
        read_catalogue: "catalogue",
      };
      const data = JSON.parse(message.content!);
      return call && kind[call.function.name]
        ? {
            request: {
              ...JSON.parse(call.function.arguments),
              tool: kind[call.function.name],
            },
            ...(data.error ? { error: data.error } : { result: data }),
          }
        : data;
    });
    messages.push({
      role: "user",
      content: JSON.stringify(
        results.every((result) => result.request)
          ? { toolResults: results }
          : results[0],
      ),
    });
  }
  return { messages };
}
