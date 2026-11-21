import { expect, it, vi } from "vitest";
import { z } from "zod";
import { consultationStepSchema } from "../apps/api/src/assistant/consultation.js";
import {
  NativeConsultation,
  type NativeMessage,
  type NativeToolCall,
  nativeCompletionSchema,
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
it.each(["reasoning", "reasoning_content"] as const)(
  "retains private %s only in native tool continuation, never in the logical answer",
  async (field) => {
    const secretThought = "private-reasoning-sentinel";
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        role: "assistant",
        content: null,
        [field]: secretThought,
        tool_calls: [call("read_knowledge", { topics: ["project-templates"] })],
      })
      .mockResolvedValueOnce({
        role: "assistant",
        content: "Reviewed advice only.",
        [field]: "another-private-reasoning-sentinel",
      });
    const native = new NativeConsultation(request);
    await native.next(context, schema);
    const answer = await native.next(
      [
        ...context,
        {
          role: "user",
          content: JSON.stringify({
            toolResults: [
              {
                request: { tool: "knowledge" },
                result: {
                  topics: [{ id: "project-templates" }],
                  selectedTopics: ["project-templates"],
                },
              },
            ],
          }),
        },
      ],
      schema,
    );
    expect(
      request.mock.calls[1]![0].some(
        (message: NativeMessage) =>
          message.role === "assistant" && message[field] === secretThought,
      ),
    ).toBe(true);
    expect(JSON.stringify(answer)).not.toContain("private-reasoning-sentinel");
    expect(answer).toMatchObject({
      explanation: "Reviewed advice only.",
      questions: [],
    });
  },
);
it("uses observed source references when a native final answer omits them, without overwriting explicit references", async () => {
  for (const [references, expected] of [
    [[], ["project-templates"]],
    [["unknown-reference"], ["unknown-reference"]],
  ] as const) {
    const native = new NativeConsultation(
      vi.fn().mockResolvedValue({
        role: "assistant",
        content: null,
        tool_calls: [
          call("send_answer", {
            kind: "advice",
            explanation: "Reviewed advice.",
            references,
          }),
        ],
      }),
    );
    const supplied = [
      context[0]!,
      {
        role: "user" as const,
        content: JSON.stringify({
          knowledge: { topics: [{ id: "project-templates" }], rules: [] },
          turns: [],
        }),
      },
    ];
    expect(await native.next(supplied, schema)).toMatchObject({
      references: expected,
    });
  }
});
it("collects questions sequentially and retains them through final prose without leaking them into a later repair", async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce({
      role: "assistant",
      content: null,
      tool_calls: [
        call("ask_question", {
          path: "projectTemplates",
          text: "Which initial owner?",
          explanation: "Choose an owner.",
          references: ["project-templates"],
          finish: false,
        }),
      ],
    })
    .mockResolvedValueOnce({
      role: "assistant",
      content: null,
      tool_calls: [
        call("ask_question", {
          path: "projectTemplates",
          text: "Confirm Workload transition?",
          explanation: "Review the transition.",
          references: ["project-templates"],
          finish: false,
        }),
      ],
    })
    .mockResolvedValueOnce({
      role: "assistant",
      content: "Both decisions remain open. Nothing saved.",
    })
    .mockResolvedValueOnce({
      role: "assistant",
      content: "Corrected advice without questions.",
    });
  const native = new NativeConsultation(request);
  const logical = [...context];
  expect(await native.next(logical, schema)).toEqual({
    action: "stage_questions",
    pendingCount: 1,
  });
  logical.push({
    role: "user",
    content: JSON.stringify({ questionStaging: { ok: true } }),
  });
  expect(await native.next(logical, schema)).toEqual({
    action: "stage_questions",
    pendingCount: 2,
  });
  logical.push({
    role: "user",
    content: JSON.stringify({ questionStaging: { ok: true } }),
  });
  const answer = await native.next(logical, schema);
  expect(answer).toMatchObject({
    action: "answer",
    questions: [
      { text: "Which initial owner?" },
      { text: "Confirm Workload transition?" },
    ],
  });
  expect(consultationStepSchema.safeParse(answer).success).toBe(true);
  expect(request.mock.calls[1]![0].at(-1)).toMatchObject({ role: "tool" });
  logical.push({
    role: "user",
    content: JSON.stringify({ answerReview: { ready: false } }),
  });
  expect(await native.next(logical, schema)).toMatchObject({ questions: [] });
});
it("finishes accumulated questions with the final question call", async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce({
      role: "assistant",
      content: null,
      tool_calls: [
        call("ask_question", {
          path: "projectTemplates",
          text: "Owner?",
          explanation: "Choose decisions.",
          finish: false,
        }),
      ],
    })
    .mockResolvedValueOnce({
      role: "assistant",
      content: null,
      tool_calls: [
        call("ask_question", {
          path: "projectTemplates",
          text: "Confirm?",
          explanation: "Choose decisions.",
          finish: true,
        }),
      ],
    });
  const native = new NativeConsultation(request);
  await native.next(context, schema);
  expect(
    await native.next(
      [
        ...context,
        {
          role: "user",
          content: JSON.stringify({ questionStaging: { ok: true } }),
        },
      ],
      schema,
    ),
  ).toMatchObject({
    action: "answer",
    questions: [{ text: "Owner?" }, { text: "Confirm?" }],
  });
});
it("assembles independent flat questions while retaining the validated proposal and exact quoted text", async () => {
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
            id: "application-vm-v1",
            initialOwnerEmail: "owner@example.test",
          },
        }),
      ],
    })
    .mockResolvedValueOnce({
      role: "assistant",
      content: null,
      tool_calls: [
        call("ask_question", {
          path: "projectTemplates",
          text: 'Use profile for Corporate "central"?',
          options: ["Confirm", "Keep existing"],
          explanation: "Choose the remaining decisions.",
          references: ["project-templates"],
        }),
        call("ask_question", {
          path: "projectTemplates",
          text: "Which central initial owner?",
          explanation: "Choose the remaining decisions.",
          references: ["project-templates"],
        }),
      ],
    });
  const native = new NativeConsultation(request);
  await native.next(context, schema);
  const answer = await native.next(
    [
      ...context,
      {
        role: "user",
        content: JSON.stringify({
          validation: { ok: true, proposal: "valid-profile" },
        }),
      },
    ],
    schema,
  );
  expect(answer).toMatchObject({
    action: "answer",
    kind: "proposal",
    proposal: "valid-profile",
    explanation: "Choose the remaining decisions.",
    questions: [
      {
        path: "projectTemplates",
        text: 'Use profile for Corporate "central"?',
      },
      { path: "projectTemplates", text: "Which central initial owner?" },
    ],
  });
  expect(consultationStepSchema.safeParse(answer).success).toBe(true);
  const tools = nativeConsultationTools(schema);
  expect(
    (
      tools.find((t) => t.function.name === "send_answer")!.function.parameters
        .properties as Record<string, unknown>
    ).questions,
  ).toBeUndefined();
});
it("decodes valid schema-typed containers without changing JSON-looking literal values", async () => {
  const normalized = vi.fn();
  const changes = [
    {
      path: "company_name",
      operation: "replace",
      value: '["literal company name"]',
    },
  ];
  const native = new NativeConsultation(
    vi.fn().mockResolvedValue({
      role: "assistant",
      content: null,
      tool_calls: [
        call("validate_proposal", {
          changes: JSON.stringify(changes),
          nativeDefaults: "[]",
        }),
      ],
    }),
    normalized,
  );
  const step = await native.next(context, schema);
  expect(step).toMatchObject({
    action: "validate_proposal",
    changes,
    basis: [],
  });
  expect(consultationStepSchema.safeParse(step).success).toBe(true);
  expect(normalized).toHaveBeenCalledWith(0, "json_encoded_tool_argument");
});
it.each([
  '[{path:"company_name",operation:"replace",value:"invalid JSON"}]',
  JSON.stringify(
    Array.from({ length: 9 }, () => ({
      path: "company_name",
      operation: "replace",
      value: "Company",
    })),
  ),
])(
  "keeps malformed and oversized encoded operations invalid (%s)",
  async (changes) => {
    const native = new NativeConsultation(
      vi.fn().mockResolvedValue({
        role: "assistant",
        content: null,
        tool_calls: [call("validate_proposal", { changes })],
      }),
    );
    expect(
      consultationStepSchema.safeParse(await native.next(context, schema))
        .success,
    ).toBe(false);
  },
);
it("preserves unknown flat-question fields for strict rejection", async () => {
  const native = new NativeConsultation(
    vi.fn().mockResolvedValue({
      role: "assistant",
      content: null,
      tool_calls: [
        call("ask_question", {
          path: "projectTemplates",
          text: "Owner?",
          explanation: "Choose the owner.",
          execute: true,
        }),
      ],
    }),
  );
  expect(
    consultationStepSchema.safeParse(await native.next(context, schema))
      .success,
  ).toBe(false);
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
    "ask_question",
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

it("withholds automatic proposal attachment after semantic rejection while retaining explicit repair choices", async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce({
      role: "assistant",
      content: null,
      tool_calls: [call("validate_proposal", { changes: [], basis: [] })],
    })
    .mockResolvedValueOnce({
      role: "assistant",
      content: "Git100 with public default access.",
    })
    .mockResolvedValueOnce({
      role: "assistant",
      content: null,
      tool_calls: [
        call("ask_question", {
          path: "devops.allowed_network_ranges",
          text: "Which access choice should we use?",
          explanation: "Git100 fits; access remains your choice.",
          finish: true,
        }),
      ],
    })
    .mockResolvedValueOnce({
      role: "assistant",
      content: null,
      tool_calls: [
        call("send_answer", {
          kind: "proposal",
          proposal: "candidate",
          explanation: "Explicitly selected repaired explanation.",
        }),
      ],
    });
  const native = new NativeConsultation(request);
  const logical = [...context];
  await native.next(logical, schema);
  logical.push({
    role: "user",
    content: JSON.stringify({
      validation: { ok: true, proposal: "candidate" },
    }),
  });
  expect(await native.next(logical, schema)).toMatchObject({
    proposal: "candidate",
  });
  logical.push({
    role: "user",
    content: JSON.stringify({
      answerReview: {
        ready: false,
        findings: ["Access was explicitly reserved."],
      },
    }),
  });
  expect(await native.next(logical, schema)).toMatchObject({
    kind: "clarification",
    proposal: null,
    questions: [{ path: "devops.allowed_network_ranges" }],
  });
  expect(JSON.stringify(request.mock.calls[2]![0])).toContain(
    "withheldProposal",
  );
  logical.push({
    role: "user",
    content: JSON.stringify({
      answerReview: { ready: false, findings: ["Repair explanation only."] },
    }),
  });
  expect(await native.next(logical, schema)).toMatchObject({
    proposal: "candidate",
  });
});

it("accepts null optional tool_calls as no calls without inventing or executing an operation", async () => {
  const parsed = nativeCompletionSchema.parse({
    choices: [
      {
        finish_reason: "stop",
        message: {
          role: "assistant",
          content: "Advice only.",
          tool_calls: null,
        },
      },
    ],
  });
  expect(parsed.choices[0]!.message.tool_calls).toBeNull();
  const request = vi.fn().mockResolvedValue(parsed.choices[0]!.message);
  expect(
    await new NativeConsultation(request).next(context, schema),
  ).toMatchObject({ action: "answer", kind: "advice", proposal: null });
  expect(request).toHaveBeenCalledTimes(1);
  expect(
    nativeCompletionSchema.safeParse({
      choices: [
        {
          finish_reason: "stop",
          message: {
            role: "assistant",
            content: "Advice",
            tool_calls: { name: "apply" },
          },
        },
      ],
    }).success,
  ).toBe(false);
});
