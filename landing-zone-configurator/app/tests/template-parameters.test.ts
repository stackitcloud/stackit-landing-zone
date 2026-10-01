import { expect, it } from "vitest";
import {
  createCommonConfiguration,
  readCommonConfiguration,
} from "../packages/domain/src/common-document.js";
import {
  addProjectTemplate,
  createPlatformDraftCopy,
  updateProjectTemplate,
} from "../packages/domain/src/project-templates.js";
import {
  type ParameterizedTemplate,
  resolveTemplateParameters,
  type TemplateParameterPolicy,
  templateParameterPreview,
  validateTemplateParameterPolicy,
} from "../packages/domain/src/template-parameters.js";

it("retains an unfinished ACL choice draft without allowing it to resolve", () => {
  const input = template();
  input.parameterPolicy = {
    schema_version: 1,
    fields: {
      ...input.parameterPolicy?.fields,
      "observability.acl": { source: "input", required: true, choices: [] },
    },
  };
  expect(() => validateTemplateParameterPolicy(input)).not.toThrow();
  expect(() => resolveTemplateParameters(input)).toThrow("Pflichtangabe fehlt");
  expect(() =>
    resolveTemplateParameters(input, { "observability.acl": [] }),
  ).toThrow();
  expect(() =>
    resolveTemplateParameters(input, {
      "observability.acl": ["203.0.113.0/24"],
    }),
  ).toThrow();
});

function template(): ParameterizedTemplate {
  return {
    kind: "corporate",
    settings: {
      env: "dev",
      secretsmanager_enabled: true,
      observability: {
        enabled: true,
        plan_name: "Observability-Starter-EU01",
        acl: [],
      },
    },
    parameterPolicy: {
      schema_version: 1,
      fields: {
        env: {
          source: "input",
          required: true,
          default: "dev",
          choices: ["dev", "test", "prod"],
        },
      },
    },
  };
}
it("resolves project-role variables only from verified context and keeps previews unresolved", () => {
  const input = template();
  input.parameterPolicy = {
    schema_version: 1,
    fields: {
      ...input.parameterPolicy?.fields,
      role_assignments: {
        source: "context",
        variable: "verified-project-owner",
        roles: ["viewer"],
      },
    },
  };
  const preview = resolveTemplateParameters(input);
  expect(preview.contextBindings[0]?.status).toBe("unresolved");
  expect(preview.qualificationBlockers.length).toBeGreaterThan(0);
  const resolved = resolveTemplateParameters(
    input,
    {},
    { verifiedStackitEmail: "owner@stackit.cloud" },
  );
  expect(resolved.settings.role_assignments).toEqual([
    { role: "viewer", subject: "owner@stackit.cloud" },
  ]);
  expect(resolved.provenance.role_assignments?.source).toBe("context");
  expect(resolved.contextBindings[0]?.status).toBe("resolved");
  expect(() =>
    resolveTemplateParameters(input, { role_assignments: [] }),
  ).toThrow();
  expect(() =>
    resolveTemplateParameters(
      input,
      {},
      { verifiedStackitEmail: "github-login" },
    ),
  ).toThrow();
  expect(input.settings.role_assignments).toBeUndefined();
});
it("resolves typed defaults and explicit stage with provenance without touching the template", () => {
  const input = template(),
    before = structuredClone(input);
  const defaults = resolveTemplateParameters(input);
  expect(defaults.settings.env).toBe("dev");
  expect(defaults.provenance.env?.source).toBe("default");
  const order = resolveTemplateParameters(input, { env: "prod" });
  expect(order.settings.env).toBe("prod");
  expect(order.provenance.env?.source).toBe("input");
  expect(order.provenance.secretsmanager_enabled?.source).toBe("fixed");
  expect(order.executionEnabled).toBe(false);
  expect(order.cloudAccess).toBe(false);
  expect(input).toEqual(before);
});
it("rejects unknown fields, fixed overrides, type confusion and forbidden choices", () => {
  for (const inputs of [
    { tenant_id: "foreign" },
    { region: "eu02" },
    { network_area_key: "foreign" },
    { owner_email: "attacker@example.com" },
    { secretsmanager_enabled: false },
    { env: false },
    { env: "staging" },
  ])
    expect(() => resolveTemplateParameters(template(), inputs)).toThrow();
});
it("validates policy manipulation and does not ignore unknown fixed field declarations", () => {
  const invalid = [
    { organization_id: { source: "fixed" } },
    {
      env: {
        source: "input",
        required: true,
        default: "prod",
        choices: ["dev"],
      },
    },
    { env: { source: "input", required: true, choices: ["dev", "dev"] } },
    {
      env: {
        source: "input",
        required: true,
        choices: ["dev", "Invalid stage"],
      },
    },
    { env: { source: "input", required: true } },
    { env: { source: "binding", binding: "own-project-network" } },
    {
      secretsmanager_enabled: {
        source: "input",
        required: true,
        default: "true",
      },
    },
    {
      secretsmanager_enabled: {
        source: "input",
        required: true,
        choices: ["true"],
      },
    },
  ];
  for (const fields of invalid)
    expect(() =>
      validateTemplateParameterPolicy({
        ...template(),
        parameterPolicy: {
          schema_version: 1,
          fields,
        } as TemplateParameterPolicy,
      }),
    ).toThrow();
});
it("keeps required inputs unresolved without a default and checks optional fallback", () => {
  const input = template();
  input.parameterPolicy = {
    schema_version: 1,
    fields: {
      env: { source: "input", required: true, choices: ["dev", "prod"] },
    },
  };
  expect(() => validateTemplateParameterPolicy(input)).not.toThrow();
  expect(templateParameterPreview(input)).toMatchObject({
    valid: false,
    error: expect.stringContaining("Pflichtangabe"),
  });
  expect(resolveTemplateParameters(input, { env: "prod" }).settings.env).toBe(
    "prod",
  );
  input.parameterPolicy.fields.env = {
    source: "input",
    required: false,
    choices: ["prod"],
  };
  expect(() => resolveTemplateParameters(input)).toThrow();
});
it("limits ACL inputs to explicit CIDR choices and rejects empty or unrestricted requests", () => {
  const input = template();
  input.parameterPolicy = {
    schema_version: 1,
    fields: {
      "observability.acl": {
        source: "input",
        required: true,
        choices: ["203.0.113.0/24", "2001:db8::/32"],
      },
    },
  };
  expect(
    resolveTemplateParameters(input, {
      "observability.acl": ["203.0.113.0/24"],
    }).provenance["observability.acl"]?.source,
  ).toBe("input");
  for (const value of [[], ["0.0.0.0/0"], ["nonsense"], "203.0.113.0/24"])
    expect(() =>
      resolveTemplateParameters(input, { "observability.acl": value }),
    ).toThrow();
  for (const source of [
    { source: "input", required: true, choices: ["not-cidr"] },
    { source: "input", required: false, choices: ["203.0.113.0/24"] },
    { source: "input", required: true },
  ] as const) {
    input.parameterPolicy.fields["observability.acl"] = JSON.parse(
      JSON.stringify(source),
    );
    expect(() => validateTemplateParameterPolicy(input)).toThrow();
  }
});
it("retains own-network binding symbolically and always reports its unqualified network source", () => {
  const input = template();
  input.parameterPolicy = {
    schema_version: 1,
    fields: {
      "observability.acl": {
        source: "binding",
        binding: "own-project-network",
      },
    },
  };
  const result = resolveTemplateParameters(input);
  expect(result.settings.observability).toMatchObject({
    access_source: "project-network",
    acl: [],
  });
  expect(result.bindings).toEqual([
    expect.objectContaining({
      path: "observability.acl",
      binding: "own-project-network",
      status: "unresolved",
    }),
  ]);
  expect(result.qualificationBlockers).toHaveLength(1);
  expect(result.executionEnabled).toBe(false);
  expect(result.provenance["observability.acl"]?.source).toBe("binding");
  expect(() =>
    resolveTemplateParameters({ ...input, kind: "public" }),
  ).toThrow();
  expect(() =>
    resolveTemplateParameters({
      ...input,
      settings: {
        ...input.settings,
        observability: { enabled: false, acl: [] },
      },
    }),
  ).toThrow();
  expect(() =>
    resolveTemplateParameters({
      ...input,
      settings: {
        ...input.settings,
        observability: { enabled: true, acl: ["203.0.113.0/24"] },
      },
    }),
  ).toThrow();
  input.parameterPolicy.fields["observability.enabled"] = {
    source: "input",
    required: true,
    default: true,
  };
  expect(() =>
    resolveTemplateParameters(input, { "observability.enabled": false }),
  ).toThrow();
});
it("migration preserves fixed stages while newly added templates opt into stage input", () => {
  const source = createCommonConfiguration("standalone", crypto.randomUUID()),
    before = structuredClone(source);
  const platform = createPlatformDraftCopy(source, crypto.randomUUID());
  expect(
    platform.projectTemplates?.every((t) => t.parameterPolicy === undefined),
  ).toBe(true);
  const restored = readCommonConfiguration(
    JSON.parse(JSON.stringify(platform)),
  );
  expect(restored).toEqual(platform);
  expect(source).toEqual(before);
  const added = addProjectTemplate(restored, "public", "new-template");
  const t = added.projectTemplates?.at(-1);
  if (!t) throw new Error("fixture");
  expect(t.parameterPolicy?.fields.env).toEqual({
    source: "input",
    required: true,
    default: "dev",
    choices: ["dev", "test", "prod"],
  });
  const fixed = updateProjectTemplate(added, t.id, { parameterPolicy: null });
  expect(fixed.projectTemplates?.at(-1)?.parameterPolicy).toBeUndefined();
  expect(() =>
    resolveTemplateParameters(
      fixed.projectTemplates?.at(-1) as ParameterizedTemplate,
      { env: "prod" },
    ),
  ).toThrow();
});

it("new preset drafts expose stage input while explicit legacy copies retain fixed values", async () => {
  const { createEditorConfiguration } = await import(
    "../packages/domain/src/editor-document.js"
  );
  const fresh = createEditorConfiguration("standalone", crypto.randomUUID());
  const configured = fresh.projectTemplates?.find(
    (template) => template.kind === "public",
  );
  expect(configured?.parameterPolicy?.fields.env).toMatchObject({
    source: "input",
    required: true,
    default: configured?.settings.env ?? "dev",
    choices: ["dev", "test", "prod"],
  });
  const old = createCommonConfiguration("standalone", crypto.randomUUID());
  const copy = createPlatformDraftCopy(old, crypto.randomUUID());
  expect(
    copy.projectTemplates?.every(
      (template) => template.parameterPolicy === undefined,
    ),
  ).toBe(true);
});
