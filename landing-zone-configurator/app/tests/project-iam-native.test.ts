import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { summarizePlan } from "@lzc/contracts";
import {
  prepareProjectIamMigration,
  projectIamConfiguration,
  readRecoveryState,
} from "@lzc/contracts/recovery";
import { expect, it } from "vitest";
import { pullIamState } from "../apps/worker/src/project-iam.js";
import { recoveryFixture } from "./fixtures/application-state-recovery.js";

const binary = process.env.LZC_TEST_TOFU_BIN;
const mirror = process.env.LZC_TEST_PROVIDER_MIRROR;
it.skipIf(!binary || !mirror)(
  "real OpenTofu and pinned provider adopt direct grants before a separate cleanup Apply",
  async () => {
    const f = recoveryFixture(),
      project = f.inventory.project.projectId;
    const central = "platform@sa.stackit.cloud",
      requester = f.variables.application.owner_email,
      automation = f.inventory.serviceAccounts[0]!.email;
    const members = new Map<string, { role: string; subject: string }>(
      ["owner", "project.owner", "project.admin"].map((role) => [
        `${role}-${requester}`,
        { role, subject: requester },
      ]),
    );
    const mutations: { method: string; body: unknown }[] = [];
    const server = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(Buffer.from(c));
      const path = new URL(req.url!, "http://localhost").pathname;
      if (
        ![
          `/v2/project/${project}/members`,
          `/v2/${project}/members`,
          `/v2/${project}/members/remove`,
        ].includes(path)
      ) {
        console.error("unexpected local provider path", req.method, path);
        res.statusCode = 404;
        res.end();
        return;
      }
      res.setHeader("content-type", "application/json");
      if (req.method === "GET") {
        res.end(
          JSON.stringify({
            resourceId: project,
            resourceType: "project",
            members: [...members.values()],
          }),
        );
        return;
      }
      const body = JSON.parse(Buffer.concat(chunks).toString());
      mutations.push({ method: req.method!, body });
      // Match the SDK AddMembers/RemoveMembers envelopes rather than inventing an import.
      for (const b of body.members) {
        const key = `${b.role}-${b.subject}`;
        if (req.method === "PATCH") members.set(key, b);
        else if (req.method === "POST" && path.endsWith("/remove"))
          members.delete(key);
        else {
          res.statusCode = 405;
          res.end();
          return;
        }
      }
      res.end(
        JSON.stringify({
          resourceId: project,
          resourceType: "project",
          members: [...members.values()],
        }),
      );
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const addr = server.address() as { port: number };
    const folder = await mkdtemp(join(tmpdir(), "lzc-iam-native-"));
    const env = {
      PATH: process.env.PATH,
      TF_INPUT: "0",
      CHECKPOINT_DISABLE: "1",
      TF_CLI_CONFIG_FILE: join(folder, "runner.tfrc"),
    };
    const command = async (args: string[]) =>
      promisify(execFile)(binary!, args, {
        cwd: folder,
        env,
        timeout: 45_000,
        maxBuffer: 8 * 1024 * 1024,
      });
    try {
      await mkdir(join(folder, "module"));
      await writeFile(
        join(folder, "runner.tfrc"),
        `provider_installation { filesystem_mirror { path = ${JSON.stringify(mirror)} } }`,
      );
      await writeFile(
        join(folder, "main.tf.json"),
        JSON.stringify({
          terraform: {
            required_providers: {
              stackit: { source: "stackitcloud/stackit", version: "0.114.0" },
            },
          },
          provider: {
            stackit: {
              service_account_token: "synthetic-token",
              authorization_custom_endpoint: `http://127.0.0.1:${addr.port}`,
              experiments: ["iam"],
            },
          },
          variable: { application: { type: "any" } },
          resource: {
            terraform_data: {
              contract: { input: f.variables.application.instance_id },
            },
          },
          module: {
            application: {
              source: "./module",
              role_assignments: "${var.application.role_assignments}",
              automation_role: "${var.application.automation_role}",
            },
          },
        }),
      );
      await writeFile(
        join(folder, "module/main.tf.json"),
        JSON.stringify({
          terraform: {
            required_providers: { stackit: { source: "stackitcloud/stackit" } },
          },
          variable: {
            role_assignments: { type: "any" },
            automation_role: { type: "string" },
          },
          output: { project_id: { value: project } },
          resource: {
            stackit_authorization_project_role_assignment: {
              this: {
                for_each:
                  '${{ for r in var.role_assignments : "${r.role}-${r.subject}" => r }}',
                resource_id: project,
                role: "${each.value.role}",
                subject: "${each.value.subject}",
              },
              sa_owner: {
                resource_id: project,
                role: "${var.automation_role}",
                subject: automation,
              },
            },
          },
        }),
      );
      const legacy = {
        ...f.variables,
        application: { ...f.variables.application, automation_role: "owner" },
      };
      await writeFile(
        join(folder, "input.tfvars.json"),
        JSON.stringify(legacy),
      );
      await command(["init", "-backend=false", "-no-color"]);
      expect(
        await pullIamState(
          dirname(dirname(binary!)),
          folder,
          env,
          Date.now() + 30_000,
        ),
      ).toBeNull();
      await command([
        "apply",
        "-auto-approve",
        "-var-file=input.tfvars.json",
        "-no-color",
      ]);
      mutations.length = 0;
      const variables = {
        ...legacy,
        application: {
          ...legacy.application,
          initial_owner_email: central,
          automation_role: "application-automation",
          role_assignments: [
            { role: "application-workload", subject: requester },
          ],
        },
      };
      await writeFile(
        join(folder, "input.tfvars.json"),
        JSON.stringify(variables),
      );
      const derive = async () => {
        const state = JSON.parse((await command(["state", "pull"])).stdout);
        // The fixture isolates the real IAM provider; project and SA metadata are
        // supplied as the independently verified bound-project discovery input.
        state.resources.push(
          ...f.state.resources.filter(
            (r) => r.type === "stackit_resourcemanager_project",
          ),
          {
            module: "module.application",
            mode: "managed",
            type: "stackit_service_account",
            name: "automation",
            provider: "stackit",
            instances: [{ attributes: { email: automation } }],
          },
        );
        return prepareProjectIamMigration({
          variables,
          state: Buffer.from(JSON.stringify(state)),
          members: {
            resourceId: project,
            resourceType: "project",
            members: [...members.values()],
          },
        })!;
      };
      const prepare = await derive();
      expect(prepare.phase).toBe("prepare");
      expect(Object.keys(prepare.imports)).toHaveLength(3);
      const files = async (context: typeof prepare) => {
        const c = projectIamConfiguration(context);
        await writeFile(
          join(folder, "lzc_project_iam.tf.json"),
          c.configuration,
        );
        await writeFile(
          join(folder, "lzc_project_iam.auto.tfvars.json"),
          c.variables,
        );
        if (c.override)
          await writeFile(
            join(folder, "lzc_project_iam_override.tf.json"),
            c.override,
          );
        else
          await rm(join(folder, "lzc_project_iam_override.tf.json"), {
            force: true,
          });
      };
      await files(prepare);
      await command(["validate", "-no-color"]);
      await command([
        "plan",
        "-var-file=input.tfvars.json",
        "-out=prepare.bin",
        "-no-color",
      ]);
      expect(mutations).toEqual([]);
      const plan = JSON.parse(
        (await command(["show", "-json", "prepare.bin"])).stdout,
      );
      expect(
        plan.resource_changes.filter(
          (r: { change: { actions: string[] } }) =>
            r.change.actions.includes("delete") &&
            ["owner", "project.owner", "project.admin"].includes(
              (r.change as { before?: { role?: string } }).before?.role ?? "",
            ),
        ),
      ).toEqual([]);
      expect(
        summarizePlan(plan, 2, "opentofu-1.12.6").iamMigration?.phase,
      ).toBe("prepare");
      await command(["apply", "-no-color", "prepare.bin"]);
      expect(members.has(`owner-${central}`)).toBe(true);
      expect(members.has(`owner-${requester}`)).toBe(true);
      expect(members.has(`owner-${automation}`)).toBe(true);
      const saved = JSON.parse((await command(["state", "pull"])).stdout);
      expect(
        readRecoveryState(
          Buffer.from(JSON.stringify(saved)),
          f.variables.application.instance_id,
        ).instances.filter((r) => r.resource.name === "lzc_project_iam"),
      ).toHaveLength(4);
      const cleanup = await derive();
      expect(cleanup.phase).toBe("cleanup");
      await files(cleanup);
      mutations.length = 0;
      await command([
        "plan",
        "-var-file=input.tfvars.json",
        "-out=cleanup.bin",
        "-no-color",
      ]);
      expect(mutations).toEqual([]);
      await command(["apply", "-no-color", "cleanup.bin"]);
      expect(members.has(`owner-${central}`)).toBe(true);
      for (const role of ["owner", "project.owner", "project.admin"])
        expect(members.has(`${role}-${requester}`)).toBe(false);
      expect(members.has(`owner-${automation}`)).toBe(false);
      expect(members.has(`application-automation-${automation}`)).toBe(true);
      expect(members.has(`application-workload-${requester}`)).toBe(true);
      expect((await derive()).phase).toBe("complete");
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(folder, { recursive: true, force: true });
    }
  },
  120_000,
);
