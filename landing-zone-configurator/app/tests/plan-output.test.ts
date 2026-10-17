import type { PlanOutput } from "@lzc/contracts";
import { expect, it } from "vitest";
import { readPlanOutput } from "../apps/web/src/plan-output.js";

const output: PlanOutput = {
  text: "Refreshing state…\n",
  kind: "live",
  truncated: false,
};
const frame = (data: PlanOutput) =>
  `${JSON.stringify({ type: "output", data })}\n`;
const headers = { "content-type": "application/x-ndjson" };
it("renders fragmented UTF-8 output while the connection is still open", async () => {
  let stream: ReadableStreamDefaultController<Uint8Array> | undefined;
  const response = new Response(
    new ReadableStream({
      start(controller) {
        stream = controller;
      },
    }),
    { headers },
  );
  const updates: PlanOutput[] = [];
  let finished = false;
  const reading = readPlanOutput(response, (value) => updates.push(value));
  void reading.then(() => {
    finished = true;
  });
  const bytes = new TextEncoder().encode(frame(output));
  for (const byte of bytes) stream?.enqueue(Uint8Array.of(byte));
  await expect.poll(() => updates).toEqual([output]);
  expect(finished).toBe(false);
  stream?.enqueue(
    new TextEncoder().encode(
      `${frame({ ...output, text: "Complete", kind: "execution" })}{"type":"complete"}\n`,
    ),
  );
  await reading;
  expect(updates.at(-1)?.text).toBe("Complete");
  expect(response.body?.locked).toBe(false);
});
it.each([
  frame(output),
  '{"type":"complete"}\n',
  `${frame(output)}{"type":"unknown"}\n`,
  `${frame(output)}{"type":"complete"}\n{"type":"heartbeat"}\n`,
  '{"private":"DO-NOT-DISPLAY",broken}\n',
  frame({ ...output, text: "€".repeat(710000) }),
])(
  "rejects incomplete, invalid or oversized streams and releases their reader",
  async (body) => {
    const response = new Response(body, { headers });
    await expect(readPlanOutput(response, () => {})).rejects.toThrow();
    expect(response.body?.locked).toBe(false);
  },
);
it("preserves JSON snapshots for history and older servers", async () => {
  const updates: PlanOutput[] = [];
  await readPlanOutput(Response.json(output), (value) => updates.push(value));
  expect(updates).toEqual([output]);
});
