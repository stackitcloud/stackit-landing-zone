import { test as base, expect } from "@playwright/test";

export { expect, type Page } from "@playwright/test";

export const test = base.extend<{ backgroundRequests: undefined }>({
  backgroundRequests: [
    async ({ context }, use) => {
      const unmocked: string[] = [];
      const lists: Record<string, unknown> = {
        "/api/v1/configurations": { configurations: [] },
        "/api/v1/preparations": { preparations: [] },
        "/api/v1/plans": { runs: [] },
        "/api/v1/invitations": { invitations: [] },
        "/api/v1/credentials": { profiles: [] },
        "/api/v1/github/forks": { forks: [], nextPage: null },
      };
      await context.route("**/api/v1/**", async (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        if (request.method() === "GET" && path in lists) {
          await route.fulfill({ json: lists[path] });
        } else if (
          (request.method() === "POST" &&
            path === "/api/v1/cloud-catalogues/automatic") ||
          (request.method() === "GET" && path === "/api/v1/organisation")
        ) {
          await route.fulfill({
            status: 503,
            json: { error: "service_unavailable" },
          });
        } else {
          unmocked.push(`${request.method()} ${path}`);
          await route.abort();
        }
      });
      await context.route("**/auth/github/status", (route) =>
        route.fulfill({ json: { connected: false } }),
      );
      await use(undefined);
      expect(unmocked, "API requests require explicit test mocks").toEqual([]);
    },
    { auto: true },
  ],
});
