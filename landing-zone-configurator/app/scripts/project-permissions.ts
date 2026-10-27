import { readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";

const [input, checkedAt] = process.argv.slice(2);
if (!input || !checkedAt || !/^\d{4}-\d{2}-\d{2}$/.test(checkedAt))
  throw new Error(
    "Usage: npm run permissions:generate -- <official-project-catalogue.json> <YYYY-MM-DD>",
  );
const catalogue = z
  .object({
    permissions: z
      .array(
        z.object({
          name: z
            .string()
            .max(256)
            .regex(/^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)+$/),
          description: z.string().max(4000).default(""),
        }),
      )
      .min(1)
      .max(2000),
  })
  .parse(JSON.parse(readFileSync(input, "utf8")));
const permissions = catalogue.permissions.sort((a, b) =>
  a.name.localeCompare(b.name, "en"),
);
if (new Set(permissions.map((p) => p.name)).size !== permissions.length)
  throw new Error("Duplicate project permissions");
writeFileSync(
  new URL(
    "../packages/domain/src/project-permissions.generated.ts",
    import.meta.url,
  ),
  "// Generated from the official STACKIT project permission catalogue; use permissions:generate.\nexport default " +
    JSON.stringify(
      {
        checkedAt,
        source:
          "https://authorization.api.stackit.cloud/v2/permissions?resourceType=project",
        permissions,
      },
      null,
      2,
    ) +
    ";\n",
);
