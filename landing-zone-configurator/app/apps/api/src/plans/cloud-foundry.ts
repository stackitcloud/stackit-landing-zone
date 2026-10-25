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
  startRecovery?(
    id: string,
    ticket: string,
    origin: string,
    record: (appId: string, sourceDropletId: string) => Promise<void>,
  ): Promise<void>;
  isRecoveryStopped?(
    id: string,
    appId: string,
    sourceDropletId: string,
  ): Promise<boolean>;
  removeRecovery?(id: string, appId: string | null): Promise<void>;
  isStopped?(
    id: string,
    appId: string,
    sourceDropletId: string,
  ): Promise<boolean>;
  readonly firewallPlansEnabled?: boolean;
  readonly acceleratorCommit?: string;
  readonly applicationMaintenanceEnabled?: boolean;
  preview?(saved: {
    bytes: Buffer;
    sha256: string;
    identity: string;
  }): Promise<unknown>;
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
export interface WarmRunnerDispatch {
  start(
    id: string,
    ticket: string,
    origin: string,
    broker: "platform" | "application",
    record: (appId: string, sourceDropletId: string) => Promise<void>,
  ): Promise<boolean>;
  remove(id: string, appId: string | null): Promise<boolean>;
}
export class CloudFoundryPlanRunner implements PlanRunner {
  readonly firewallPlansEnabled: boolean;
  readonly acceleratorCommit?: string;
  readonly applicationMaintenanceEnabled?: boolean;
  readonly preview?: NonNullable<PlanRunner["preview"]>;
  readonly output?: NonNullable<PlanRunner["output"]>;

  constructor(
    private readonly config: {
      username: string;
      password: string;
      spaceId: string;
      templateId: string;
      broker?: "platform" | "application";
      dropletId?: string;
      inspection?: PlanRunner & { readonly packageId: string };
      warm?: WarmRunnerDispatch;
    },
  ) {
    this.firewallPlansEnabled =
      config.inspection?.firewallPlansEnabled === true;
    guid(config.spaceId);
    guid(config.templateId);
    z.enum(["platform", "application"]).parse(config.broker ?? "platform");
    if (config.inspection) {
      guid(config.dropletId);
      const inspection = config.inspection;
      if (
        !inspection.preview ||
        !inspection.output ||
        !inspection.acceleratorCommit
      )
        throw new Error("Runner inspection configuration incomplete");
      this.acceleratorCommit = inspection.acceleratorCommit;
      this.applicationMaintenanceEnabled =
        inspection.applicationMaintenanceEnabled === true;
      this.preview = async (saved) => {
        if (!this.supportsArtifact(saved.identity))
          throw new Error("Runner package changed");
        return inspection.preview?.({
          ...saved,
          identity: inspection.packageId,
        });
      };
      this.output = async (id, _appId, saved) => {
        if (!saved) return { text: "", truncated: false, kind: "live" };
        if (!this.supportsArtifact(saved.identity))
          throw new Error("Runner package changed");
        return (
          inspection.output?.(id, id, {
            ...saved,
            identity: inspection.packageId,
          }) ?? { text: "", truncated: false, kind: "live" }
        );
      };
    }
  }

  supportsAccelerator(commit: string) {
    return (
      commit ===
      (this.acceleratorCommit ?? "a256f6896d11134fdc351786f1be5eba4e56b2e2")
    );
  }

  supportsArtifact(identity: string) {
    return Boolean(
      this.config.inspection && identity === this.config.dropletId,
    );
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
    if (
      await this.config.warm?.start(
        id,
        ticket,
        origin,
        this.config.broker ?? "platform",
        record,
      )
    )
      return;
    const { call, appId } = await this.prepare(
      `lzc-plan-${id}`,
      {
        LZC_RUN_TICKET: ticket,
        LZC_BROKER_ORIGIN: origin,
        LZC_RUN_ID: id,
        ...(this.config.broker === "application"
          ? { LZC_RUNNER_BROKER: "application" }
          : {}),
      },
      record,
    );
    await call(`apps/${appId}/tasks`, "POST", {
      name: "initial-plan",
      command: "./runtime/bin/node apps/worker/dist/main.js",
      memory_in_mb: 1024,
      disk_in_mb: 4096,
    });
  }

  async prepareWarm(
    id: string,
    ticket: string,
    origin: string,
    record: (appId: string, sourceDropletId: string) => Promise<void>,
  ) {
    guid(id);
    if (!this.config.dropletId || !/^[A-Za-z0-9_-]{43}$/.test(ticket))
      throw new Error("Warm runner configuration incomplete");
    const { call, appId } = await this.prepare(
      `lzc-warm-${id}`,
      {
        LZC_POOL_RUNNER_ID: id,
        LZC_POOL_TICKET: ticket,
        LZC_BROKER_ORIGIN: origin,
      },
      record,
    );
    const process = z
      .object({ guid: z.uuid() })
      .parse(await call(`apps/${appId}/processes/web`));
    await call(`processes/${process.guid}`, "PATCH", {
      command: "./runtime/bin/node apps/worker/dist/main.js",
      health_check: { type: "process" },
    });
    await call(`processes/${process.guid}/actions/scale`, "POST", {
      instances: 1,
      memory_in_mb: 1024,
      disk_in_mb: 4096,
    });
    await call(`apps/${appId}/actions/start`, "POST", {});
  }

  async startRecovery(
    id: string,
    ticket: string,
    origin: string,
    record: (appId: string, sourceDropletId: string) => Promise<void>,
  ) {
    guid(id);
    if (
      this.config.broker !== "application" ||
      !this.config.dropletId ||
      !/^[A-Za-z0-9_-]{43}$/.test(ticket)
    )
      throw new Error("Recovery Runner configuration invalid");
    const { call, appId } = await this.prepare(
      `lzc-recovery-${id}`,
      {
        LZC_STATE_RECOVERY_TASK: id,
        LZC_RUN_TICKET: ticket,
        LZC_BROKER_ORIGIN: origin,
        LZC_RUNNER_BROKER: "application",
      },
      record,
    );
    await call(`apps/${appId}/tasks`, "POST", {
      name: "state-recovery",
      command: "./runtime/bin/node apps/worker/dist/state-recovery-main.js",
      memory_in_mb: 1024,
      disk_in_mb: 4096,
    });
  }

  async removeRecovery(id: string, appId: string | null) {
    guid(id);
    await this.removeNamed(`lzc-recovery-${id}`, appId);
  }

  private async prepare(
    name: string,
    variables: Record<string, string>,
    record: (appId: string, sourceDropletId: string) => Promise<void>,
  ) {
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
    if (this.config.dropletId && droplet.guid !== this.config.dropletId)
      throw new Error("Runner package changed");
    const app = await call("apps", "POST", {
      name,
      lifecycle: {
        type: "buildpack",
        data: { buildpacks: ["binary_buildpack"], stack: "cflinuxfs4" },
      },
      relationships: { space: { data: { guid: this.config.spaceId } } },
      environment_variables: variables,
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
    return { call, appId };
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
          (this.config.broker === "application"
            ? "LZC_BROKER_ORIGIN,LZC_RUNNER_BROKER,LZC_RUN_ID,LZC_RUN_TICKET"
            : "LZC_BROKER_ORIGIN,LZC_RUN_ID,LZC_RUN_TICKET") ||
        (this.config.broker === "application" &&
          variables.LZC_RUNNER_BROKER !== "application")
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
    if (await this.config.warm?.remove(id, appId)) return;
    await this.removeNamed(`lzc-plan-${id}`, appId);
  }
  async isStopped(id: string, appId: string, sourceDropletId: string) {
    return this.inspectStopped(id, appId, sourceDropletId, false);
  }
  async isRecoveryStopped(id: string, appId: string, sourceDropletId: string) {
    return this.inspectStopped(id, appId, sourceDropletId, true);
  }
  private async inspectStopped(
    id: string,
    appId: string,
    sourceDropletId: string,
    recovery: boolean,
  ) {
    guid(id);
    guid(appId);
    guid(sourceDropletId);
    const call = await this.authorized();
    const app = z
      .object({
        guid: z.literal(appId),
        name: z.string(),
        state: z.enum(["STARTED", "STOPPED"]),
        relationships: z.object({
          space: z.object({
            data: z.object({ guid: z.literal(this.config.spaceId) }),
          }),
        }),
      })
      .parse(await call(`apps/${appId}`));
    const warm =
      !recovery &&
      app.name.startsWith("lzc-warm-") &&
      z.uuid().safeParse(app.name.slice("lzc-warm-".length)).success;
    if (!warm && app.name !== `${recovery ? "lzc-recovery" : "lzc-plan"}-${id}`)
      throw new Error("Runner identity mismatch");
    const routes = z
      .object({ resources: z.array(z.unknown()) })
      .parse(await call(`apps/${appId}/routes`));
    if (routes.resources.length) throw new Error("Runner identity mismatch");
    const droplet = z.object({
      guid: z.uuid(),
      state: z.literal("STAGED"),
      checksum: z.object({
        type: z.literal("sha256"),
        value: z.string().regex(/^[a-f0-9]{64}$/),
      }),
      relationships: z.object({
        app: z.object({ data: z.object({ guid: z.uuid() }) }),
      }),
    });
    const source = droplet.parse(await call(`droplets/${sourceDropletId}`));
    const current = droplet.parse(await call(`apps/${appId}/droplets/current`));
    if (
      source.guid !== sourceDropletId ||
      source.relationships.app.data.guid !== this.config.templateId ||
      current.relationships.app.data.guid !== appId ||
      current.guid === sourceDropletId ||
      current.checksum.value !== source.checksum.value
    )
      throw new Error("Runner source mismatch");
    if (app.state !== "STOPPED") return false;
    const tasks = z
      .object({
        pagination: z.object({ next: z.unknown().nullable() }),
        resources: z.array(z.object({ name: z.string(), state: z.string() })),
      })
      .parse(await call(`apps/${appId}/tasks?per_page=100`));
    if (
      !Object.hasOwn(tasks.pagination, "next") ||
      tasks.pagination.next ||
      tasks.resources.some((t) => !["SUCCEEDED", "FAILED"].includes(t.state))
    )
      return false;
    if (!warm)
      return tasks.resources.some(
        (t) => t.name === (recovery ? "state-recovery" : "initial-plan"),
      );
    const stats = z
      .object({ resources: z.array(z.object({ state: z.string() })) })
      .parse(await call(`apps/${appId}/processes/web/stats`));
    // An empty or unavailable observation is not evidence of process loss.
    return (
      stats.resources.length > 0 &&
      stats.resources.every((s) => ["DOWN", "CRASHED"].includes(s.state))
    );
  }
  async removeWarm(id: string, appId: string | null) {
    guid(id);
    await this.removeNamed(`lzc-warm-${id}`, appId);
  }
  private async removeNamed(name: string, appId: string | null) {
    const call = await this.authorized();
    // Look up the deterministic name too: handles a crash before persisting the CF GUID.
    const found = z
      .object({
        resources: z.array(z.object({ guid: z.uuid(), name: z.literal(name) })),
      })
      .parse(
        await call(`apps?space_guids=${this.config.spaceId}&names=${name}`),
      );
    for (const app of found.resources) {
      if (appId && appId !== app.guid)
        throw new Error("Runner identity mismatch");
      await call(`apps/${app.guid}`, "DELETE");
    }
  }
}
