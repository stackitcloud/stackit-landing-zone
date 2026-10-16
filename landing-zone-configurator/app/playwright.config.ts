import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.LZC_E2E_PORT ?? "4173");
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Invalid LZC_E2E_PORT");

export default defineConfig({
  testDir: "./e2e",
  outputDir: "../.local/browser-tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    locale: "de-DE",
    trace: "retain-on-failure",
    ...(process.env.LZC_TEST_CHROME === "true" ? { channel: "chrome" } : {}),
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: "mobile",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  webServer: {
    command: `npm run preview --workspace=@lzc/web -- --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
  },
});
