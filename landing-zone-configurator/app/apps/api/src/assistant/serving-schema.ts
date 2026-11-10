/** Project the wire grammar only; callers still validate with the original Zod schema. */
export function assistantServingResponseSchema<
  T extends Record<string, unknown>,
>(schema: T): T {
  const result = structuredClone(schema);
  const visit = (value: unknown): void => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const node = value as Record<string, unknown>;
    delete node.propertyNames;
    const types = Array.isArray(node.type) ? node.type : [node.type];
    // vLLM's automatic backend selection rejects pattern/format + length
    // intersections in xgrammar. Bounds stay on the wire; native validation
    // and permission catalogues still enforce formats before any acceptance.
    if (
      types.includes("string") &&
      ("minLength" in node || "maxLength" in node)
    ) {
      delete node.pattern;
      delete node.format;
    }
    // An advice-only empty array cannot contain items. Do not send unreachable
    // proposal grammars that can nevertheless trigger a backend fallback.
    if (types.includes("array") && node.maxItems === 0) {
      node.items = {};
      delete node.prefixItems;
    }
    for (const [key, child] of Object.entries(node)) {
      if (
        ["properties", "$defs", "definitions", "patternProperties"].includes(
          key,
        )
      ) {
        if (child && typeof child === "object")
          for (const nested of Object.values(child)) visit(nested);
      } else if (["anyOf", "oneOf", "allOf", "prefixItems"].includes(key)) {
        if (Array.isArray(child)) for (const nested of child) visit(nested);
      } else if (
        ["items", "additionalProperties", "not", "if", "then", "else"].includes(
          key,
        )
      ) {
        visit(child);
      }
    }
  };
  visit(result);
  return result;
}
