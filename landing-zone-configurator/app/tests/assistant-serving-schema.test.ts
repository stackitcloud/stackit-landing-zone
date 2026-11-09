import { expect, it } from "vitest";
import { z } from "zod";
import { assistantEditorResponseSchema } from "../apps/api/src/assistant/editor.js";
import { assistantServingResponseSchema } from "../apps/api/src/assistant/serving-schema.js";

it("omits unreachable proposal grammars from advice without permitting changes", () => {
  const original = z.strictObject({
    changes: z
      .array(
        z.strictObject({
          path: z.literal("connectivity.dns_zones"),
          value: z
            .string()
            .max(63)
            .regex(/^[a-z]+$/),
        }),
      )
      .max(0),
  });
  const schema = z.toJSONSchema(original);
  const projected = assistantServingResponseSchema(schema);
  expect(projected.properties?.changes).toMatchObject({
    maxItems: 0,
    items: {},
  });
  expect(schema.properties?.changes).toHaveProperty(
    "items.properties.value.pattern",
  );
  expect(original.safeParse({ changes: [] }).success).toBe(true);
  expect(
    original.safeParse({
      changes: [{ path: "connectivity.dns_zones", value: "valid" }],
    }).success,
  ).toBe(false);
});

it("keeps server-side DNS bounds, patterns and map-key checks after wire projection", () => {
  const zone = z.strictObject({
    name: z
      .string()
      .min(1)
      .max(10)
      .regex(/^[a-z]+$/),
    email: z.email().max(254),
    networks: z.record(z.string().regex(/^[a-z]+$/), z.string()),
  });
  const wire = assistantEditorResponseSchema(zone);
  expect(wire.properties?.name).toMatchObject({ minLength: 1, maxLength: 10 });
  expect(wire.properties?.name).not.toHaveProperty("pattern");
  expect(wire.properties?.email).not.toHaveProperty("format");
  expect(wire.properties?.networks).not.toHaveProperty("propertyNames");
  const valid = {
    name: "example",
    email: "owner@example.test",
    networks: { public: "value" },
  };
  expect(zone.safeParse(valid).success).toBe(true);
  for (const invalid of [
    { ...valid, name: "INVALID" },
    { ...valid, name: "longerthanallowed" },
    { ...valid, email: "invalid" },
    { ...valid, networks: { "invalid.key": "value" } },
    { ...valid, extra: "not allowed" },
  ])
    expect(zone.safeParse(invalid).success).toBe(false);
  expect(wire.additionalProperties).toBe(false);
  expect(wire.required).toEqual(["name", "email", "networks"]);
});

it("preserves supported patterns and fields named after JSON-schema keywords", () => {
  const original = z.strictObject({
    pattern: z.string().regex(/^allowed$/),
    propertyNames: z.string().max(20),
  });
  const projected = assistantServingResponseSchema(z.toJSONSchema(original));
  expect(projected.properties?.pattern).toHaveProperty("pattern", "^allowed$");
  expect(projected.properties).toHaveProperty("propertyNames");
  expect(projected).toHaveProperty("required", ["pattern", "propertyNames"]);
  expect(assistantServingResponseSchema(projected)).toEqual(projected);
});
