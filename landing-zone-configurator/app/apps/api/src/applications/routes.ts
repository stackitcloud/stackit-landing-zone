import {
  applicationInterruptedApplyRequestSchema,
  applicationInterruptedPlanRequestSchema,
  applicationOrderDecisionSchema,
  applicationPlanPurposeSchema,
  applicationRecoveryReplanRequestSchema,
  applicationRecoveryReviewRequestSchema,
} from "@lzc/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  type AuthServices,
  authenticatedSession,
  validMutation,
} from "../auth/routes.js";
import type { Session } from "../auth/store.js";
import { RecoveryReplanError } from "./recovery-replan.js";
import {
  ApplicationError,
  type Applications,
  applicationRunnerPackageSchema,
} from "./service.js";
import { StateRecoveryError } from "./state-recovery.js";

export type ApplicationRunnerServices = Pick<
  Applications,
  | "runnerInput"
  | "runnerStage"
  | "runnerArtifact"
  | "runnerOutput"
  | "runnerResult"
> &
  Partial<
    Pick<
      Applications,
      | "resolveRunnerBinding"
      | "runnerRecovery"
      | "stateRecoveryInput"
      | "stateRecoveryFence"
      | "stateRecoveryResult"
    >
  >;

export function registerApplicationRunner(
  app: FastifyInstance,
  applications: ApplicationRunnerServices,
  input: unknown,
) {
  const binding = applicationRunnerPackageSchema.parse(input);
  const resolveBinding = async (key: string) =>
    applications.resolveRunnerBinding
      ? applications.resolveRunnerBinding(key, binding)
      : binding;
  const ticket = (authorization: string | undefined) => {
    if (!authorization || !/^Bearer [A-Za-z0-9_-]{43}$/.test(authorization))
      throw new ApplicationError(401, "invalid_application_runner_ticket");
    return authorization.slice(7);
  };
  app.register(async (routes) => {
    routes.setErrorHandler((error, _request, reply) => {
      if ((error as { statusCode?: number }).statusCode === 413)
        return reply.code(413).send({ error: "request_too_large" });
      if (
        error instanceof ApplicationError ||
        error instanceof StateRecoveryError
      )
        return reply.code(error.status).send({ error: error.code });
      if (error instanceof z.ZodError)
        return reply
          .code(400)
          .send({ error: "invalid_application_runner_request" });
      if (error instanceof Error && "code" in error) {
        if (error.code === "40001" || error.code === "55000")
          return reply
            .code(409)
            .send({ error: "application_runner_report_conflict" });
        if (error.code === "42501" || error.code === "P0002")
          return reply
            .code(403)
            .send({ error: "application_runner_access_denied" });
      }
      app.log.warn(
        { event: "application_runner_request_failed" },
        "Application runner request failed",
      );
      return reply
        .code(503)
        .send({ error: "application_runner_request_failed" });
    });
    routes.post(
      "/api/application-runner/input",
      { bodyLimit: 1024 },
      async (request) => {
        const key = ticket(request.headers.authorization);
        z.strictObject({}).parse(request.body);
        return applications.runnerInput(key, await resolveBinding(key));
      },
    );
    if (
      applications.stateRecoveryInput &&
      applications.stateRecoveryFence &&
      applications.stateRecoveryResult
    ) {
      const recoveryInput = applications.stateRecoveryInput.bind(applications);
      const recoveryFence = applications.stateRecoveryFence.bind(applications);
      const recoveryResult =
        applications.stateRecoveryResult.bind(applications);
      routes.post(
        "/api/application-state-recovery/input",
        { bodyLimit: 1024 },
        async (request) => {
          z.strictObject({}).parse(request.body);
          const key = ticket(request.headers.authorization);
          return recoveryInput(key, await resolveBinding(key));
        },
      );
      for (const path of ["fence", "result"] as const)
        routes.post(
          `/api/application-state-recovery/${path}`,
          { bodyLimit: path === "fence" ? 1024 : 12 * 1024 * 1024 + 65536 },
          async (request) => {
            const key = ticket(request.headers.authorization);
            return path === "fence"
              ? recoveryFence(key, await resolveBinding(key), request.body)
              : recoveryResult(key, await resolveBinding(key), request.body);
          },
        );
    }
    for (const { path, method, limit } of [
      { path: "stage", method: "runnerStage", limit: 1024 },
      {
        path: "artifact",
        method: "runnerArtifact",
        limit: 22 * 1024 * 1024 + 65536,
      },
      {
        path: "output",
        method: "runnerOutput",
        limit: 12 * 1024 * 1024 + 1024,
      },
      { path: "result", method: "runnerResult", limit: 65536 },
    ] as const) {
      routes.post(
        `/api/application-runner/${path}`,
        { bodyLimit: limit },
        async (request, reply) => {
          const key = ticket(request.headers.authorization);
          const receipt = await applications[method](
            key,
            await resolveBinding(key),
            request.body,
          );
          return method === "runnerArtifact" ? receipt : reply.code(204).send();
        },
      );
    }
    const recovery = applications.runnerRecovery?.bind(applications);
    if (recovery)
      routes.post(
        "/api/application-runner/recovery",
        { bodyLimit: 22 * 1024 * 1024 + 65536 },
        async (request) => {
          const key = ticket(request.headers.authorization);
          return recovery(key, await resolveBinding(key), request.body);
        },
      );
  });
}

export function registerApplications(
  app: FastifyInstance,
  auth: AuthServices,
  applications: Pick<
    Applications,
    | "listTemplates"
    | "publish"
    | "retire"
    | "listInstances"
    | "order"
    | "listPlatformContracts"
    | "approvePlatformContract"
    | "preparePlanInput"
  > &
    Partial<
      Pick<
        Applications,
        | "orderQuota"
        | "updateOrderQuota"
        | "prepareJob"
        | "decideOrder"
        | "deleteOrder"
        | "deleteTemplate"
        | "configureExecution"
        | "listExecutionBindings"
        | "executionCapabilities"
        | "executionLifecycle"
        | "upgradeExecution"
        | "listJobs"
        | "revokeJobGrant"
        | "approveJobBackend"
        | "dispatchJob"
        | "startPlan"
        | "previewPlan"
        | "outputJob"
        | "diagnoseRecovery"
        | "completeInterruptedPlan"
        | "inspectInterruptedApply"
        | "recoveryReviewContext"
        | "recordRecoveryReview"
        | "checkRecoveryReplan"
        | "approveRecoveryReplan"
        | "latestStateRecovery"
        | "getStateRecovery"
        | "requestStateRecovery"
        | "assessStateRecovery"
        | "commitStateRecovery"
        | "inspectStateRecovery"
        | "startApply"
        | "listGroups"
        | "createGroup"
        | "deleteGroup"
        | "setGroupMembers"
        | "setTemplateGroups"
        | "appliedPlatformsEnabled"
        | "listAppliedPlatforms"
        | "previewAppliedPlatform"
        | "approveAppliedPlatform"
      >
    >,
) {
  const sessions = new WeakMap<FastifyRequest, Session>();
  app.register(async (routes) => {
    routes.setErrorHandler((error, _request, reply) => {
      if (
        error instanceof ApplicationError ||
        error instanceof RecoveryReplanError ||
        error instanceof StateRecoveryError
      )
        return reply.code(error.status).send({ error: error.code });
      if (error instanceof z.ZodError)
        return reply.code(400).send({ error: "invalid_application_request" });
      if (error instanceof Error && "code" in error && error.code === "40001") {
        if (
          [
            "application_order_quota_exceeded",
            "application_order_quota_changed",
            "application_order_decision_conflict",
            "application_approval_not_required",
            "application_order_not_approved",
            "application_order_deleted",
            "application_order_execution_started",
            "application_order_archive_unavailable",
            "template_version_in_use",
            "template_version_not_retired",
            "application_execution_binding_conflict",
            "application_execution_changed",
            "application_upgrade_execution_active",
            "application_execution_upgrade_changed",
            "application_execution_upgrade_unavailable",
            "application_execution_source_withdrawn",
            "application_execution_package_unavailable",
            "application_apply_plan_unavailable",
            "application_apply_package_changed",
            "application_recovery_fresh_plan_required",
            "application_recovery_replan_changed",
            "application_recovery_replan_unavailable",
            "application_recovery_review_changed",
            "application_recovery_review_unavailable",
            "application_plan_recovery_unavailable",
            "application_plan_recovery_changed",
            "application_apply_recovery_unavailable",
            "application_apply_recovery_changed",
            "application_state_recovery_changed",
            "application_state_recovery_active",
          ].includes(error.message)
        )
          return reply.code(409).send({ error: error.message });
        const code =
          error.message === "application_instance_running"
            ? "application_instance_running"
            : "application_backend_binding_conflict";
        return reply.code(409).send({ error: code });
      }
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "42501" &&
        [
          "application_upgrade_source_unavailable",
          "application_recovery_source_unavailable",
          "application_execution_binding_changed",
          "application_execution_source_withdrawn",
          "application_upgrade_confirmation_required",
        ].includes(error.message)
      )
        return reply
          .code(
            error.message === "application_upgrade_confirmation_required"
              ? 400
              : 409,
          )
          .send({ error: error.message });
      if (
        error instanceof Error &&
        "code" in error &&
        (error.code === "42501" || error.code === "P0002")
      )
        return reply.code(403).send({ error: "application_access_denied" });
      app.log.warn(
        { event: "application_request_failed" },
        "Application request failed",
      );
      return reply.code(503).send({ error: "application_request_failed" });
    });
    routes.addHook("preHandler", async (request, reply) => {
      const session = await authenticatedSession(request, auth);
      if (!session)
        return reply.code(401).send({ error: "authentication_required" });
      if (
        request.headers["x-lzc-tenant"] !== session.tenantId ||
        (request.method !== "GET" &&
          !validMutation(request, session, auth.origin))
      )
        return reply
          .code(403)
          .send({ error: "invalid_request_origin_or_csrf" });
      sessions.set(request, session);
    });
    routes.get(
      "/api/v1/applications/instances/:id/execution-lifecycle",
      async (request, reply) => {
        const session = sessions.get(request);
        if (!session) return reply.code(401).send();
        if (!applications.executionLifecycle)
          return reply
            .code(503)
            .send({ error: "application_execution_lifecycle_unavailable" });
        const { id } = z.strictObject({ id: z.uuid() }).parse(request.params);
        return applications.executionLifecycle(session, id);
      },
    );
    routes.post(
      "/api/v1/applications/instances/:id/execution-lifecycle",
      { bodyLimit: 1024 },
      async (request, reply) => {
        const session = sessions.get(request);
        if (!session) return reply.code(401).send();
        if (!applications.upgradeExecution)
          return reply
            .code(503)
            .send({ error: "application_execution_lifecycle_unavailable" });
        const { id } = z.strictObject({ id: z.uuid() }).parse(request.params);
        return applications.upgradeExecution(session, id, request.body);
      },
    );
    routes.get(
      "/api/v1/applications/execution-bindings",
      async (request, reply) => {
        const session = sessions.get(request);
        if (!session) return reply.code(401).send();
        return {
          bindings: (await applications.listExecutionBindings?.(session)) ?? [],
        };
      },
    );
    routes.post(
      "/api/v1/applications/platform-contracts/:id/execution",
      { bodyLimit: 1024 },
      async (request, reply) => {
        const session = sessions.get(request);
        if (!session) return reply.code(401).send();
        if (!applications.configureExecution)
          return reply
            .code(503)
            .send({ error: "application_execution_unavailable" });
        const { id } = z.strictObject({ id: z.uuid() }).parse(request.params);
        const input = z
          .discriminatedUnion("enabled", [
            z.strictObject({
              enabled: z.literal(true),
              stateBackendId: z.uuid(),
              confirmExecution: z.literal(true),
            }),
            z.strictObject({
              enabled: z.literal(false),
              confirmRevocation: z.literal(true),
            }),
          ])
          .parse(request.body);
        return applications.configureExecution(session, id, input);
      },
    );
    routes.get(
      "/api/v1/applications/platform-contracts",
      async (request, reply) => {
        const session = sessions.get(request);
        if (!session) return reply.code(401).send();
        return { contracts: await applications.listPlatformContracts(session) };
      },
    );
    routes.post(
      "/api/v1/applications/platform-contracts",
      async (request, reply) => {
        const session = sessions.get(request);
        if (!session) return reply.code(401).send();
        return applications.approvePlatformContract(session, request.body);
      },
    );
    if (applications.appliedPlatformsEnabled?.()) {
      routes.get(
        "/api/v1/applications/applied-platforms",
        async (request, reply) => {
          const session = sessions.get(request);
          if (!session) return reply.code(401).send();
          return {
            platforms: await applications.listAppliedPlatforms?.(session),
          };
        },
      );
      routes.get(
        "/api/v1/applications/applied-platforms/:id/preview",
        async (request, reply) => {
          const session = sessions.get(request);
          if (!session) return reply.code(401).send();
          const { id } = z.object({ id: z.uuid() }).parse(request.params);
          return applications.previewAppliedPlatform?.(session, id);
        },
      );
      routes.post(
        "/api/v1/applications/applied-platforms/approve",
        async (request, reply) => {
          const session = sessions.get(request);
          if (!session) return reply.code(401).send();
          return applications.approveAppliedPlatform?.(session, request.body);
        },
      );
    }
    if (applications.listGroups)
      routes.get("/api/v1/applications/groups", async (request, reply) => {
        const session = sessions.get(request);
        if (!session) return reply.code(401).send();
        return applications.listGroups?.(session);
      });
    if (applications.createGroup)
      routes.post(
        "/api/v1/applications/groups",
        { bodyLimit: 1024 },
        async (request, reply) => {
          const session = sessions.get(request);
          if (!session) return reply.code(401).send();
          return applications.createGroup?.(session, request.body);
        },
      );
    if (applications.deleteGroup)
      routes.delete(
        "/api/v1/applications/groups/:id",
        { bodyLimit: 1024 },
        async (request, reply) => {
          const session = sessions.get(request);
          if (!session) return reply.code(401).send();
          const { id } = z.object({ id: z.uuid() }).parse(request.params);
          return applications.deleteGroup?.(session, id, request.body);
        },
      );
    if (applications.setGroupMembers)
      routes.post(
        "/api/v1/applications/groups/:id/members",
        { bodyLimit: 16384 },
        async (request, reply) => {
          const session = sessions.get(request);
          if (!session) return reply.code(401).send();
          const { id } = z.object({ id: z.uuid() }).parse(request.params);
          return applications.setGroupMembers?.(session, id, request.body);
        },
      );
    if (applications.setTemplateGroups)
      routes.post(
        "/api/v1/applications/templates/:id/groups",
        { bodyLimit: 8192 },
        async (request, reply) => {
          const session = sessions.get(request);
          if (!session) return reply.code(401).send();
          const { id } = z.object({ id: z.uuid() }).parse(request.params);
          return applications.setTemplateGroups?.(session, id, request.body);
        },
      );
    routes.get("/api/v1/applications/templates", async (request, reply) => {
      const session = sessions.get(request);
      if (!session) return reply.code(401).send();
      return {
        versions: await applications.listTemplates(session),
        ...(applications.orderQuota
          ? { orderQuota: await applications.orderQuota(session) }
          : {}),
        retirementEnabled: true,
        templateDeletionEnabled: Boolean(applications.deleteTemplate),
        deploymentPolicyEnabled: true,
        ...(applications.appliedPlatformsEnabled?.()
          ? { appliedPlatformsEnabled: true }
          : {}),
        ...(applications.listGroups && applications.setTemplateGroups
          ? { groupAccessEnabled: true }
          : {}),
      };
    });
    if (applications.orderQuota)
      routes.get("/api/v1/applications/order-quota", async (request, reply) => {
        const session = sessions.get(request);
        if (!session) return reply.code(401).send();
        return applications.orderQuota?.(session);
      });
    if (applications.updateOrderQuota)
      routes.post(
        "/api/v1/applications/order-quota",
        { bodyLimit: 1024 },
        async (request, reply) => {
          const session = sessions.get(request);
          if (!session) return reply.code(401).send();
          return applications.updateOrderQuota?.(session, request.body);
        },
      );
    routes.post("/api/v1/applications/templates", async (request, reply) => {
      const session = sessions.get(request);
      if (!session) return reply.code(401).send();
      return applications.publish(session, request.body);
    });
    routes.post(
      "/api/v1/applications/templates/:id/retire",
      async (request, reply) => {
        const session = sessions.get(request);
        if (!session) return reply.code(401).send();
        const { id } = z.object({ id: z.uuid() }).parse(request.params);
        return applications.retire(session, id, request.body);
      },
    );
    if (applications.deleteTemplate)
      routes.post(
        "/api/v1/applications/templates/:id/delete",
        async (request, reply) => {
          const session = sessions.get(request);
          if (!session) return reply.code(401).send();
          const { id } = z.object({ id: z.uuid() }).parse(request.params);
          return applications.deleteTemplate?.(session, id, request.body);
        },
      );
    routes.get("/api/v1/applications/instances", async (request, reply) => {
      const session = sessions.get(request);
      if (!session) return reply.code(401).send();
      return {
        instances: await applications.listInstances(session),
        orderDecisionEnabled: Boolean(applications.decideOrder),
        executionDelegationEnabled: Boolean(applications.configureExecution),
        executionLifecycleEnabled: Boolean(
          applications.executionLifecycle && applications.upgradeExecution,
        ),
        orderDeletionEnabled: Boolean(applications.deleteOrder),
        execution: applications.executionCapabilities?.() ?? {
          planEnabled: false,
          applyEnabled: false,
        },
        planJobsEnabled: Boolean(
          applications.listJobs && applications.prepareJob,
        ),
      };
    });
    routes.delete(
      "/api/v1/applications/instances/:id",
      { bodyLimit: 1024 },
      async (request, reply) => {
        const session = sessions.get(request);
        if (!session) return reply.code(401).send();
        if (!applications.deleteOrder)
          return reply
            .code(503)
            .send({ error: "application_deletions_unavailable" });
        const { id } = z.strictObject({ id: z.uuid() }).parse(request.params);
        const input = z
          .union([
            z.strictObject({ confirmDeletion: z.literal(true) }),
            z.strictObject({ confirmArchive: z.literal(true) }),
          ])
          .parse(request.body);
        return applications.deleteOrder(session, id, input);
      },
    );
    routes.post("/api/v1/applications/instances", async (request, reply) => {
      const session = sessions.get(request);
      if (!session) return reply.code(401).send();
      return applications.order(session, request.body);
    });
    routes.post(
      "/api/v1/applications/instances/:id/decision",
      { bodyLimit: 8192 },
      async (request, reply) => {
        const session = sessions.get(request);
        if (!session) return reply.code(401).send();
        if (!applications.decideOrder)
          return reply
            .code(503)
            .send({ error: "application_decisions_unavailable" });
        const { id } = z.strictObject({ id: z.uuid() }).parse(request.params);
        const input = applicationOrderDecisionSchema.parse(request.body);
        return applications.decideOrder(session, id, input);
      },
    );
    routes.post(
      "/api/v1/applications/instances/:id/plan-input",
      async (request, reply) => {
        const session = sessions.get(request);
        if (!session) return reply.code(401).send();
        const { id } = z.object({ id: z.uuid() }).parse(request.params);
        z.strictObject({}).parse(request.body);
        return applications.preparePlanInput(session, id);
      },
    );
    routes.post(
      "/api/v1/applications/instances/:id/plan",
      { bodyLimit: 1024 },
      async (request, reply) => {
        const session = sessions.get(request);
        if (!session) return reply.code(401).send();
        if (!applications.startPlan)
          return reply
            .code(503)
            .send({ error: "application_dispatch_disabled" });
        const { id } = z.strictObject({ id: z.uuid() }).parse(request.params);
        const input = z
          .strictObject({
            idempotencyKey: z.uuid(),
            purpose: applicationPlanPurposeSchema.optional(),
          })
          .parse(request.body);
        return reply
          .code(202)
          .send(await applications.startPlan(session, id, input));
      },
    );
    routes.get(
      "/api/v1/applications/jobs/:id/preview",
      async (request, reply) => {
        const session = sessions.get(request);
        if (!session) return reply.code(401).send();
        if (!applications.previewPlan)
          return reply
            .code(503)
            .send({ error: "application_preview_unavailable" });
        const { id } = z.strictObject({ id: z.uuid() }).parse(request.params);
        return applications.previewPlan(session, id);
      },
    );
    routes.get(
      "/api/v1/applications/jobs/:id/output",
      async (request, reply) => {
        const session = sessions.get(request);
        if (!session) return reply.code(401).send();
        if (!applications.outputJob)
          return reply
            .code(503)
            .send({ error: "application_output_unavailable" });
        const { id } = z.strictObject({ id: z.uuid() }).parse(request.params);
        return applications.outputJob(session, id);
      },
    );
    routes.get(
      "/api/v1/applications/jobs/:id/recovery-diagnosis",
      async (request, reply) => {
        const session = sessions.get(request);
        if (!session) return reply.code(401).send();
        if (!applications.diagnoseRecovery)
          return reply
            .code(503)
            .send({ error: "application_recovery_diagnosis_unavailable" });
        const { id } = z.strictObject({ id: z.uuid() }).parse(request.params);
        return applications.diagnoseRecovery(session, id);
      },
    );
    routes.get(
      "/api/v1/applications/jobs/:id/state-recovery",
      async (request, reply) => {
        const session = sessions.get(request);
        if (!session) return reply.code(401).send();
        if (!applications.latestStateRecovery)
          return reply
            .code(503)
            .send({ error: "application_state_recovery_unavailable" });
        const { id } = z.strictObject({ id: z.uuid() }).parse(request.params);
        return applications.latestStateRecovery(session, id);
      },
    );
    routes.post(
      "/api/v1/applications/jobs/:id/state-recovery",
      { bodyLimit: 1024 },
      async (request, reply) => {
        const session = sessions.get(request);
        if (!session) return reply.code(401).send();
        if (!applications.requestStateRecovery)
          return reply
            .code(503)
            .send({ error: "application_state_recovery_unavailable" });
        const { id } = z.strictObject({ id: z.uuid() }).parse(request.params);
        return applications.requestStateRecovery(session, id, request.body);
      },
    );
    routes.get(
      "/api/v1/applications/state-recoveries/:id",
      async (request, reply) => {
        const session = sessions.get(request);
        if (!session) return reply.code(401).send();
        if (!applications.getStateRecovery)
          return reply
            .code(503)
            .send({ error: "application_state_recovery_unavailable" });
        const { id } = z.strictObject({ id: z.uuid() }).parse(request.params);
        return applications.getStateRecovery(session, id);
      },
    );
    for (const action of ["assess", "commit", "inspect"] as const)
      routes.post(
        `/api/v1/applications/state-recoveries/:id/${action}`,
        { bodyLimit: 2048 },
        async (request, reply) => {
          const session = sessions.get(request);
          if (!session) return reply.code(401).send();
          const method =
            action === "assess"
              ? applications.assessStateRecovery
              : action === "inspect"
                ? applications.inspectStateRecovery
                : applications.commitStateRecovery;
          if (!method)
            return reply
              .code(503)
              .send({ error: "application_state_recovery_unavailable" });
          const { id } = z.strictObject({ id: z.uuid() }).parse(request.params);
          if (action === "assess")
            z.strictObject({
              confirmReadOnlyAssessment: z.literal(true),
            }).parse(request.body);
          if (action === "inspect") z.strictObject({}).parse(request.body);
          return method.call(applications, session, id, request.body);
        },
      );
    routes.post(
      "/api/v1/applications/jobs/:id/complete-interrupted-plan",
      { bodyLimit: 1024 },
      async (request, reply) => {
        const session = sessions.get(request);
        if (!session) return reply.code(401).send();
        if (!applications.completeInterruptedPlan)
          return reply
            .code(503)
            .send({ error: "application_plan_recovery_unavailable" });
        const { id } = z.strictObject({ id: z.uuid() }).parse(request.params);
        return applications.completeInterruptedPlan(
          session,
          id,
          applicationInterruptedPlanRequestSchema.parse(request.body),
        );
      },
    );
    routes.post(
      "/api/v1/applications/jobs/:id/inspect-interrupted-apply",
      { bodyLimit: 1024 },
      async (request, reply) => {
        const session = sessions.get(request);
        if (!session) return reply.code(401).send();
        if (!applications.inspectInterruptedApply)
          return reply
            .code(503)
            .send({ error: "application_apply_recovery_unavailable" });
        const { id } = z.strictObject({ id: z.uuid() }).parse(request.params);
        return applications.inspectInterruptedApply(
          session,
          id,
          applicationInterruptedApplyRequestSchema.parse(request.body),
        );
      },
    );
    routes.get(
      "/api/v1/applications/jobs/:id/recovery-review",
      async (request, reply) => {
        const session = sessions.get(request);
        if (!session) return reply.code(401).send();
        if (!applications.recoveryReviewContext)
          return reply
            .code(503)
            .send({ error: "application_recovery_review_unavailable" });
        const { id } = z.strictObject({ id: z.uuid() }).parse(request.params);
        return applications.recoveryReviewContext(session, id);
      },
    );
    routes.post(
      "/api/v1/applications/jobs/:id/recovery-review",
      { bodyLimit: 1024 },
      async (request, reply) => {
        const session = sessions.get(request);
        if (!session) return reply.code(401).send();
        if (!applications.recordRecoveryReview)
          return reply
            .code(503)
            .send({ error: "application_recovery_review_unavailable" });
        const { id } = z.strictObject({ id: z.uuid() }).parse(request.params);
        return applications.recordRecoveryReview(
          session,
          id,
          applicationRecoveryReviewRequestSchema.parse(request.body),
        );
      },
    );
    routes.post(
      "/api/v1/applications/jobs/:id/recovery-replan/check",
      { bodyLimit: 1024 },
      async (request, reply) => {
        const session = sessions.get(request);
        if (!session) return reply.code(401).send();
        if (!applications.checkRecoveryReplan)
          return reply
            .code(503)
            .send({ error: "application_recovery_replan_unavailable" });
        const { id } = z.strictObject({ id: z.uuid() }).parse(request.params);
        z.strictObject({}).parse(request.body);
        return applications.checkRecoveryReplan(session, id);
      },
    );
    routes.post(
      "/api/v1/applications/jobs/:id/recovery-replan",
      { bodyLimit: 16384 },
      async (request, reply) => {
        const session = sessions.get(request);
        if (!session) return reply.code(401).send();
        if (!applications.approveRecoveryReplan)
          return reply
            .code(503)
            .send({ error: "application_recovery_replan_unavailable" });
        const { id } = z.strictObject({ id: z.uuid() }).parse(request.params);
        return applications.approveRecoveryReplan(
          session,
          id,
          applicationRecoveryReplanRequestSchema.parse(request.body),
        );
      },
    );
    routes.post(
      "/api/v1/applications/jobs/:id/apply",
      { bodyLimit: 1024 },
      async (request, reply) => {
        const session = sessions.get(request);
        if (!session) return reply.code(401).send();
        if (!applications.startApply)
          return reply.code(503).send({ error: "application_apply_disabled" });
        const { id } = z.strictObject({ id: z.uuid() }).parse(request.params);
        const input = z
          .strictObject({
            artifactSha256: z.string().regex(/^[0-9a-f]{64}$/),
            confirmDestroy: z.literal(true).optional(),
            instanceId: z.uuid().optional(),
          })
          .parse(request.body);
        return reply
          .code(202)
          .send(await applications.startApply(session, id, input));
      },
    );
    routes.post(
      "/api/v1/applications/instances/:id/jobs",
      { bodyLimit: 1024 },
      async (request, reply) => {
        const session = sessions.get(request);
        if (!session) return reply.code(401).send();
        if (!applications.prepareJob)
          return reply
            .code(503)
            .send({ error: "application_jobs_unavailable" });
        const { id } = z.strictObject({ id: z.uuid() }).parse(request.params);
        return applications.prepareJob(session, id, request.body);
      },
    );
    routes.get(
      "/api/v1/applications/instances/:id/jobs",
      async (request, reply) => {
        const session = sessions.get(request);
        if (!session) return reply.code(401).send();
        if (!applications.listJobs)
          return reply
            .code(503)
            .send({ error: "application_jobs_unavailable" });
        const { id } = z.strictObject({ id: z.uuid() }).parse(request.params);
        return { jobs: await applications.listJobs(session, id) };
      },
    );
    routes.post(
      "/api/v1/applications/jobs/:id/credential-grant/revoke",
      { bodyLimit: 1024 },
      async (request, reply) => {
        const session = sessions.get(request);
        if (!session) return reply.code(401).send();
        if (!applications.revokeJobGrant)
          return reply
            .code(503)
            .send({ error: "application_jobs_unavailable" });
        const { id } = z.strictObject({ id: z.uuid() }).parse(request.params);
        return applications.revokeJobGrant(session, id, request.body);
      },
    );
    routes.post(
      "/api/v1/applications/jobs/:id/backend-approval",
      { bodyLimit: 1024 },
      async (request, reply) => {
        const session = sessions.get(request);
        if (!session) return reply.code(401).send();
        if (!applications.approveJobBackend)
          return reply
            .code(503)
            .send({ error: "application_jobs_unavailable" });
        const { id } = z.strictObject({ id: z.uuid() }).parse(request.params);
        return applications.approveJobBackend(session, id, request.body);
      },
    );
    routes.post(
      "/api/v1/applications/jobs/:id/dispatch",
      { bodyLimit: 1024 },
      async (request, reply) => {
        const session = sessions.get(request);
        if (!session) return reply.code(401).send();
        if (!applications.dispatchJob)
          return reply
            .code(503)
            .send({ error: "application_dispatch_disabled" });
        const { id } = z.strictObject({ id: z.uuid() }).parse(request.params);
        const input = z
          .strictObject({ confirmPlan: z.literal(true) })
          .parse(request.body);
        return reply
          .code(202)
          .send(await applications.dispatchJob(session, id, input));
      },
    );
  });
}
