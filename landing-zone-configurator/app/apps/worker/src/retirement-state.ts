/** Compare the authoritative HTTP document, never OpenTofu's reserialized State.
 * OpenTofu can reorder check_results or add null fields during `state pull`. */
export async function readRetirementBackendState(
  address: string,
  ticket: string,
  deadline: number,
  request: typeof fetch = fetch,
) {
  const response = await request(address, {
    method: "GET",
    redirect: "error",
    signal: AbortSignal.timeout(
      Math.max(1, Math.min(60000, deadline - Date.now())),
    ),
    headers: {
      authorization: `Basic ${Buffer.from(`runner:${ticket}`).toString("base64")}`,
    },
  });
  if (!response.ok || !response.body)
    throw Error("retirement_backend_read_failed");
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16 * 1024 * 1024)
        throw Error("retirement_native_output_invalid");
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } finally {
    await reader.cancel();
  }
}
