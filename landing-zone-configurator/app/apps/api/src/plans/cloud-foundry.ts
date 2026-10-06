import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";

const guid = (value: unknown) => z.uuid().parse(value);
export class RunnerRequestError extends Error {
  constructor(
    readonly operation: string,
    readonly status: number,
  ) {
    super("Runner request failed");
  }
}
const api = "https://api.system.01.cf.eu01.stackit.cloud";
export interface PlanRunner {
  supportsArtifact?(identity: string): boolean;
  supportsAccelerator?(commit: string): boolean;
  output?(
    id: string,
    appId: string | null,
    saved?: { bytes: Buffer; sha256: string; identity: string },
  ): Promise<{ text: string; truncated: boolean; kind: "live" | "saved-plan" }>;
  start(
    id: string,
    ticket: string,
    origin: string,
    record: (appId: string, sourceDropletId: string) => Promise<void>,
  ): Promise<void>;
  remove(id: string, appId: string | null): Promise<void>;
}
export class CloudFoundryPlanRunner implements PlanRunner {
  constructor(
    private readonly config: {
      username: string;
      password: string;
      spaceId: string;
      templateId: string;
    },
  ) {
    guid(config.spaceId);
    guid(config.templateId);
  }
  private async authorized() {
    const deadline = Date.now() + 120000;
    const response = await fetch(
      "https://uaa.system.01.cf.eu01.stackit.cloud/oauth/token",
      {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(
          Math.max(1, Math.min(15000, deadline - Date.now())),
        ),
        headers: {
          Authorization: `Basic ${Buffer.from("cf:").toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "password",
          username: this.config.username,
          password: this.config.password,
        }),
      },
    );
    if (!response.ok)
      throw new RunnerRequestError("authentication", response.status);
    const { access_token } = z
      .object({ access_token: z.string().min(1).max(32768) })
      .parse(await response.json());
    return async (path: string, method = "GET", body?: unknown) => {
      if (Date.now() >= deadline)
        throw new Error("Runner request deadline exceeded");
      const result = await fetch(`${api}/v3/${path}`, {
        method,
        redirect: "error",
        signal: AbortSignal.timeout(
          Math.max(1, Math.min(15000, deadline - Date.now())),
        ),
        headers: {
          Authorization: `Bearer ${access_token}`,
          "Content-Type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!result.ok)
        throw new RunnerRequestError(
          `${method} ${path.split(/[/?]/)[0]}`,
          result.status,
        );
      if (result.status === 202 || result.status === 204) {
        await result.arrayBuffer();
        return {};
      }
      return (await result.json()) as Record<string, unknown>;
    };
  }
  async start(
    id: string,
    ticket: string,
    origin: string,
    record: (appId: string, sourceDropletId: string) => Promise<void>,
  ) {
    guid(id);
    const call = await this.authorized();
    const template = await call(`apps/${this.config.templateId}`);
    const templateSchema = z.object({
      name: z.string(),
      relationships: z.object({
        space: z.object({
          data: z.object({ guid: z.literal(this.config.spaceId) }),
        }),
      }),
    });
    if (templateSchema.parse(template).name !== "lzc-plan-template")
      throw new Error("Runner template mismatch");
    const droplet = await call(
      `apps/${this.config.templateId}/droplets/current`,
    );
    if (droplet.state !== "STAGED") throw new Error("Runner not staged");
    const app = await call("apps", "POST", {
      name: `lzc-plan-${id}`,
      lifecycle: {
        type: "buildpack",
        data: { buildpacks: ["binary_buildpack"], stack: "cflinuxfs4" },
      },
      relationships: { space: { data: { guid: this.config.spaceId } } },
      environment_variables: {
        LZC_RUN_TICKET: ticket,
        LZC_BROKER_ORIGIN: origin,
        LZC_RUN_ID: id,
      },
    });
    const appId = guid(app.guid);
    await record(appId, guid(droplet.guid));
    const copied = await call(
      `droplets?source_guid=${guid(droplet.guid)}`,
      "POST",
      { relationships: { app: { data: { guid: appId } } } },
    );
    const dropletId = guid(copied.guid);
    for (let attempt = 0; attempt < 30; attempt++) {
      const current = await call(`droplets/${dropletId}`);
      if (current.state === "STAGED") break;
      if (current.state !== "COPYING" || attempt === 29)
        throw new Error("Runner copy failed");
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    await call(`apps/${appId}/relationships/current_droplet`, "PATCH", {
      data: { guid: dropletId },
    });
    await call(`apps/${appId}/tasks`, "POST", {
      name: "initial-plan",
      command: "./runtime/bin/node apps/worker/dist/main.js",
      memory_in_mb: 1024,
      disk_in_mb: 4096,
    });
  }
  async probe(origin: string, forbiddenAppId: string) {
    guid(forbiddenAppId);
    const started = Date.now();
    const id = randomUUID();
    let appId: string | null = null;
    try {
      // No database job exists for this random ticket. The broker must reject it.
      await this.start(
        id,
        randomBytes(32).toString("base64url"),
        origin,
        async (value) => {
          appId = value;
        },
      );
      const dispatchMilliseconds = Date.now() - started;
      if (!appId) throw new Error("Probe app missing");
      const call = await this.authorized();
      try {
        await call(`apps/${forbiddenAppId}`);
        throw new Error("Runner identity can access the Configurator app");
      } catch (error) {
        if (
          !(error instanceof RunnerRequestError) ||
          ![403, 404].includes(error.status)
        )
          throw error;
      }
      const environment = await call(`apps/${appId}/environment_variables`);
      const variables = z
        .record(z.string(), z.unknown())
        .parse(environment.var);
      if (
        Object.keys(variables).sort().join(",") !==
        "LZC_BROKER_ORIGIN,LZC_RUN_ID,LZC_RUN_TICKET"
      )
        throw new Error("Unexpected runner environment");
      for (const path of [
        `apps/${appId}/routes`,
        `service_credential_bindings?app_guids=${appId}`,
      ]) {
        const response = z
          .object({ resources: z.array(z.unknown()) })
          .parse(await call(path));
        if (response.resources.length !== 0)
          throw new Error("Unexpected runner binding");
      }
      for (let attempt = 0; attempt < 40; attempt++) {
        const tasks = z
          .object({ resources: z.array(z.object({ state: z.string() })) })
          .parse(await call(`apps/${appId}/tasks`));
        if (tasks.resources[0]?.state === "FAILED")
          return {
            dispatchMilliseconds,
            completionMilliseconds: Date.now() - started,
          };
        if (tasks.resources[0]?.state === "SUCCEEDED")
          throw new Error("Invalid ticket was accepted");
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      throw new Error("Probe timed out");
    } finally {
      await this.remove(id, appId);
    }
  }
  async remove(id: string, appId: string | null) {
    guid(id);
    const call = await this.authorized();
    // Look up the deterministic name too: handles a crash before persisting the CF GUID.
    const found = z
      .object({
        resources: z.array(
          z.object({ guid: z.uuid(), name: z.literal(`lzc-plan-${id}`) }),
        ),
      })
      .parse(
        await call(
          `apps?space_guids=${this.config.spaceId}&names=lzc-plan-${id}`,
        ),
      );
    for (const app of found.resources) {
      if (appId && appId !== app.guid)
        throw new Error("Runner identity mismatch");
      await call(`apps/${app.guid}`, "DELETE");
    }
  }
}
