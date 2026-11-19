import { expect, it, vi } from "vitest";
import { z } from "zod";
import { consultationStepSchema } from "../apps/api/src/assistant/consultation.js";
import {
  NativeConsultation,
  type NativeMessage,
  type NativeToolCall,
  nativeConsultationTools,
} from "../apps/api/src/assistant/native-consultation.js";

const schema = z.toJSONSchema(consultationStepSchema);
const context = [
  { role: "system" as const, content: "Consult the user." },
  {
    role: "user" as const,
    content: JSON.stringify({
      knowledge: { rules: [], topics: [] },
      turns: [
        { index: 0, role: "user", content: "Explain Git for 80 developers." },
      ],
    }),
  },
];
const call = (name: string, args: unknown): NativeToolCall => ({
  id: `call-${name}`,
  type: "function",
  function: { name, arguments: JSON.stringify(args) },
});
it("maps exact template permission lists without adding preset rights", async () => {
  const request = vi.fn().mockResolvedValue({
    role: "assistant",
    content: null,
    tool_calls: [
      call("propose_template_access_profile", {
        templateKeys: ["central"],
        selection: {
          kind: "custom",
          initialOwnerEmail: "owner@example.test",
          permissions: ["iaas.server.get", "resource-manager.project.get"],
          automationPermissions: ["iaas.server.get"],
        },
      }),
    ],
  });
  const result = await new NativeConsultation(request).next(context, schema);
  expect(result).toMatchObject({
    action: "validate_proposal",
    basis: [],
    changes: [
      {
        path: "projectTemplates.central.accessProfile",
        operation: "replace",
        value: {
          mode: "granular",
          initialOwnerEmail: "owner@example.test",
          permissions: ["iaas.server.get", "resource-manager.project.get"],
          automationPermissions: ["iaas.server.get"],
        },
      },
    ],
  });
});
it("bases a later typed permission tool on the successful local profile proposal", async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce({
      role: "assistant",
      content: null,
      tool_calls: [
        call("propose_template_access_profile", {
          templateKeys: ["central"],
          selection: {
            kind: "preset",
            id: "application-workloads-v1",
            initialOwnerEmail: "owner@example.test",
            replaceLegacyAccess: true,
          },
        }),
      ],
    })
    .mockResolvedValueOnce({
      role: "assistant",
      content: null,
      tool_calls: [
        call("propose_template_permissions", {
          templateKeys: ["central"],
          principals: ["requester"],
          source: { kind: "services", ids: ["ske"] },
        }),
      ],
    });
  const native = new NativeConsultation(request);
  const first = await native.next(context, schema);
  expect(first).toMatchObject({
    changes: [{ value: { replaceLegacyAccess: true } }],
  });
  expect(consultationStepSchema.safeParse(first).success).toBe(true);
  const second = await native.next(
    [
      ...context,
      {
        role: "user",
        content: JSON.stringify({
          validation: { ok: true, proposal: "validated-transition" },
        }),
      },
    ],
    schema,
  );
  expect(second).toMatchObject({
    action: "validate_proposal",
    baseProposal: "validated-transition",
  });
  expect(consultationStepSchema.safeParse(second).success).toBe(true);
});
it("maps full Owner selection to the registered atomic preset", async () => {
  const request = vi.fn().mockResolvedValue({
    role: "assistant",
    content: null,
    tool_calls: [
      call("propose_template_access_profile", {
        templateKeys: ["central"],
        selection: { kind: "preset", id: "owner" },
      }),
    ],
  });
  expect(await new NativeConsultation(request).next(context, schema)).toEqual({
    action: "validate_proposal",
    basis: [],
    changes: [
      {
        path: "projectTemplates.central.accessProfile",
        operation: "preset",
        value: { id: "owner" },
      },
    ],
  });
});
it("keeps additions scoped to the selected templates and principals", async () => {
  const selection = {
    templateKeys: ["public"],
    principals: ["requester"],
    source: { kind: "permissions", ids: ["iaas.server.get"] },
  };
  const request = vi.fn().mockResolvedValue({
    role: "assistant",
    content: null,
    tool_calls: [call("propose_template_permissions", selection)],
  });
  expect(await new NativeConsultation(request).next(context, schema)).toEqual({
    action: "validate_proposal",
    basis: [],
    changes: [
      {
        path: "projectTemplates",
        operation: "add_permissions",
        value: selection,
      },
    ],
  });
  const tool = nativeConsultationTools(schema).find(
    (t) => t.function.name === "propose_template_permissions",
  )!;
  expect(tool.function.parameters).toMatchObject({
    type: "object",
    required: expect.arrayContaining(["templateKeys", "principals", "source"]),
  });
});
it("uses small native schemas and keeps the user's actual message as a user turn", async () => {
  const request = vi.fn(async (messages: NativeMessage[]) => {
    expect(messages.at(-1)).toEqual({
      role: "user",
      content: "Conversation turn 0:\nExplain Git for 80 developers.",
    });
    return {
      role: "assistant" as const,
      content: "Git100 supports up to 100 users.",
    };
  });
  const result = await new NativeConsultation(request).next(context, schema);
  expect(result).toMatchObject({
    action: "answer",
    kind: "advice",
    proposal: null,
    questions: [],
  });
  const tools = nativeConsultationTools(schema);
  expect(tools.map((t) => t.function.name)).toEqual([
    "read_configuration",
    "read_knowledge",
    "read_native_default",
    "read_catalogue",
    "validate_proposal",
    "send_answer",
    "propose_template_permissions",
    "propose_template_access_profile",
  ]);
  expect(JSON.stringify(tools).length).toBeLessThan(20000);
  const properties = tools.find(
    (tool) => tool.function.name === "validate_proposal",
  )!.function.parameters.properties as Record<string, unknown>;
  expect(properties.nativeDefaults).toBeDefined();
  expect(properties.basis).toBeUndefined();
});
it("returns pure results through matching tool roles and carries only a successful local proposal", async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce({
      role: "assistant",
      content: null,
      tool_calls: [call("read_knowledge", { topics: ["devops-git"] })],
    })
    .mockResolvedValueOnce({
      role: "assistant",
      content: null,
      tool_calls: [
        call("validate_proposal", {
          changes: [
            {
              path: "devops.git_flavor",
              operation: "replace",
              value: "git-100",
            },
          ],
          basis: [],
        }),
      ],
    })
    .mockResolvedValueOnce({
      role: "assistant",
      content: "Git100 fits your 80 developers; review the proposal.",
    });
  const native = new NativeConsultation(request);
  await native.next(context, schema);
  const reads = [
    ...context,
    {
      role: "user" as const,
      content: JSON.stringify({
        toolResults: [
          {
            request: { tool: "knowledge", topics: ["devops-git"] },
            result: { topics: [{ id: "devops-git" }], rules: [] },
          },
        ],
      }),
    },
  ];
  await native.next(reads, schema);
  expect(request.mock.calls[0]?.[4]).toBe("read_knowledge");
  expect(request.mock.calls[1]?.[4]).toBeUndefined();
  expect(request.mock.calls[1]?.[0].at(-1)).toEqual({
    role: "tool",
    tool_call_id: "call-read_knowledge",
    content: JSON.stringify({ topics: [{ id: "devops-git" }], rules: [] }),
  });
  const result = await native.next(
    [
      ...reads,
      {
        role: "user",
        content: JSON.stringify({
          validation: { ok: true, proposal: "validated-1" },
        }),
      },
    ],
    schema,
  );
  expect(result).toMatchObject({
    action: "answer",
    kind: "proposal",
    proposal: "validated-1",
    references: ["devops-git"],
  });
});
it("does not reuse a successful proposal after a rejected replacement", async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce({
      role: "assistant",
      content: null,
      tool_calls: [call("validate_proposal", { changes: [], basis: [] })],
    })
    .mockResolvedValueOnce({
      role: "assistant",
      content: null,
      tool_calls: [call("validate_proposal", { changes: [], basis: [] })],
    })
    .mockResolvedValueOnce({
      role: "assistant",
      content: "A decision is still missing.",
    });
  const native = new NativeConsultation(request);
  await native.next(context, schema);
  const success = [
    ...context,
    {
      role: "user" as const,
      content: JSON.stringify({ validation: { ok: true, proposal: "old" } }),
    },
  ];
  await native.next(success, schema);
  expect(
    await native.next(
      [
        ...success,
        {
          role: "user",
          content: JSON.stringify({ validation: { ok: false } }),
        },
      ],
      schema,
    ),
  ).toMatchObject({ proposal: null });
});
it("keeps answer-review feedback out of user turns after a natural-language reply", async () => {
  const request = vi
    .fn()
    .mockResolvedValue({ role: "assistant", content: "Reviewed answer." });
  const native = new NativeConsultation(request);
  await native.next(context, schema);
  await native.next(
    [
      ...context,
      {
        role: "user",
        content: JSON.stringify({
          answerReview: { ready: false, findings: ["Explain reachability."] },
        }),
      },
    ],
    schema,
  );
  const messages = request.mock.calls[1]?.[0] as NativeMessage[];
  expect(messages.at(-1)?.role).toBe("system");
  expect(messages.filter((m) => m.role === "user")).toHaveLength(2);
});
it("rejects unknown functions and empty final messages without executing them", async () => {
  const unknown = new NativeConsultation(
    vi.fn().mockResolvedValue({
      role: "assistant",
      content: null,
      tool_calls: [call("execute_cloud", {})],
    }),
  );
  await expect(unknown.next(context, schema)).rejects.toMatchObject({
    reason: "unsupported_native_tool",
  });
  const empty = new NativeConsultation(
    vi.fn().mockResolvedValue({ role: "assistant", content: "" }),
  );
  await expect(empty.next(context, schema)).rejects.toMatchObject({
    reason: "empty_native_answer",
  });
});

it("normalizes a provider tag-only call into matching native tool roles without publishing markup", async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce({
      role: "assistant",
      content:
        '<tool_call>\n{"name":"read_knowledge","arguments":{"topics":["devops-git"]}}\n</tool_call>',
    })
    .mockResolvedValueOnce({
      role: "assistant",
      content: "Git100 supports up to 100 users.",
    });
  const normalized = vi.fn(),
    native = new NativeConsultation(request, normalized);
  expect(await native.next(context, schema)).toMatchObject({
    action: "inspect",
    requests: [{ tool: "knowledge", topics: ["devops-git"] }],
  });
  expect(normalized).toHaveBeenCalledWith(0);
  const answer = await native.next(
    [
      ...context,
      {
        role: "user",
        content: JSON.stringify({
          toolResults: [
            {
              request: { tool: "knowledge", topics: ["devops-git"] },
              result: {
                topics: [{ id: "devops-git" }],
                selectedTopics: ["devops-git"],
              },
            },
          ],
        }),
      },
    ],
    schema,
  );
  expect(answer).toMatchObject({
    action: "answer",
    explanation: "Git100 supports up to 100 users.",
  });
  const messages = request.mock.calls[1]?.[0] as NativeMessage[];
  const assistant = messages.find(
    (message) => message.role === "assistant" && message.tool_calls,
  );
  expect(assistant).toMatchObject({
    content: null,
    tool_calls: [{ id: "native-text-0-0" }],
  });
  expect(messages.at(-1)).toMatchObject({
    role: "tool",
    tool_call_id: "native-text-0-0",
  });
});
it("bounds automatic citations and prioritizes the selected topic over dependencies", async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce({
      role: "assistant",
      content: null,
      tool_calls: [call("read_knowledge", { topics: ["important"] })],
    })
    .mockResolvedValueOnce({ role: "assistant", content: "Reviewed answer." });
  const native = new NativeConsultation(request);
  await native.next(context, schema);
  const answer = (await native.next(
    [
      ...context,
      {
        role: "user",
        content: JSON.stringify({
          toolResults: [
            {
              request: { tool: "knowledge", topics: ["important"] },
              result: {
                topics: [
                  ...Array.from({ length: 12 }, (_, index) => ({
                    id: `dependency-${index}`,
                  })),
                  { id: "important" },
                ],
                selectedTopics: ["important"],
              },
            },
          ],
        }),
      },
    ],
    schema,
  )) as { references: string[] };
  expect(answer.references).toHaveLength(8);
  expect(answer.references[0]).toBe("important");
});
it("rejects mixed or malformed tool markup and never interprets arbitrary functions", async () => {
  const mixed = new NativeConsultation(
    vi.fn().mockResolvedValue({
      role: "assistant",
      content:
        'Please do this: <tool_call>{"name":"read_knowledge","arguments":{}}</tool_call>',
    }),
  );
  expect(await mixed.next(context, schema)).toMatchObject({
    action: "invalid_native_tool_encoding",
  });
  const unknown = new NativeConsultation(
    vi.fn().mockResolvedValue({
      role: "assistant",
      content: '<tool_call>{"name":"execute_cloud","arguments":{}}</tool_call>',
    }),
  );
  await expect(unknown.next(context, schema)).rejects.toMatchObject({
    reason: "unsupported_native_tool",
  });
});
