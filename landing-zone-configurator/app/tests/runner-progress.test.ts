import { openTofuProgress } from "@lzc/contracts";
import { expect, it } from "vitest";

const version = JSON.stringify({
  type: "version",
  ui: "1.2",
  "@message": "OpenTofu 1.12.6",
});
it("projects only native human messages, never raw plan metadata or output values", () => {
  const result = openTofuProgress(
    [
      version,
      JSON.stringify({
        type: "refresh_start",
        "@message": "Refreshing state...",
        hook: { private: "private-plan-value" },
      }),
      JSON.stringify({
        type: "outputs",
        "@message": "private-output-value",
        outputs: { secret: "private-output-value" },
      }),
      JSON.stringify({
        type: "future_event",
        "@message": "New progress message",
      }),
    ].join("\n"),
  );
  expect(result).toEqual({
    text: "OpenTofu 1.12.6\nRefreshing state...\nNew progress message\n",
    invalid: false,
  });
});
it.each([
  '{"type":"version","ui":"2.0","@message":"private-value"}',
  '{"type":"refresh_start","@message":"private-value"}',
  `${version}\n{"private":"private-value"}`,
  `${version}\n{"broken":"private-value"`,
])(
  "surfaces invalid or unsupported UI events without copying their raw values",
  (input) => {
    const result = openTofuProgress(input);
    expect(result.invalid).toBe(true);
    expect(result.text).toContain("[OpenTofu progress event unavailable]");
    expect(result.text).not.toContain("private-value");
  },
);

it("includes human diagnostic details without exposing structured snippets or expression values", () => {
  const output = openTofuProgress(
    [
      version,
      JSON.stringify({
        type: "diagnostic",
        "@message": "Error: Invalid IPv4 configuration",
        diagnostic: {
          detail:
            "When IPv4 is configured, provide ipv4_prefix or ipv4_prefix_length.",
          snippet: {
            code: "private-snippet-value",
            values: [{ value: "private-expression-value" }],
          },
          address: "private-address",
        },
      }),
    ].join("\n"),
  );
  expect(output.text).toContain("Error: Invalid IPv4 configuration");
  expect(output.text).toContain("provide ipv4_prefix or ipv4_prefix_length");
  expect(output.invalid).toBe(false);
  expect(output.text).not.toContain("private-");
});
