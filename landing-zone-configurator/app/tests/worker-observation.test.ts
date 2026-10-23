import { appendFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { watchPlanVersion } from "../apps/worker/src/observation.js";

const roots: string[] = [];
const version = JSON.stringify({
  type: "version",
  ui: "1.2",
  "@message": "OpenTofu 1.12.6",
});
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

it("observes a completed version record once without forwarding native contents", async () => {
  const root = await mkdtemp(join(tmpdir(), "lzc-observation-"));
  roots.push(root);
  const observed = vi.fn();
  const stop = watchPlanVersion(root, () => true, observed);
  try {
    const file = join(root, "plan-events.log");
    await writeFile(file, version.slice(0, 20));
    await new Promise((done) => setTimeout(done, 40));
    expect(observed).not.toHaveBeenCalled();
    await appendFile(
      file,
      `${version.slice(20)}\n${JSON.stringify({ type: "diagnostic", "@message": "private-engine-value" })}\n`,
    );
    await vi.waitFor(() => expect(observed).toHaveBeenCalledExactlyOnceWith());
    await appendFile(file, `${version}\n`);
    await new Promise((done) => setTimeout(done, 40));
    expect(observed).toHaveBeenCalledTimes(1);
  } finally {
    stop();
  }
});

it.each(["closed", "inactive"])(
  "does not observe a %s command",
  async (mode) => {
    const root = await mkdtemp(join(tmpdir(), "lzc-observation-"));
    roots.push(root);
    const observed = vi.fn();
    const stop = watchPlanVersion(root, () => mode !== "inactive", observed);
    try {
      if (mode === "closed") stop();
      await writeFile(join(root, "plan-events.log"), `${version}\n`);
      await new Promise((done) => setTimeout(done, 40));
      expect(observed).not.toHaveBeenCalled();
    } finally {
      stop();
    }
  },
);

it("leaves Plan execution available if the optional watcher cannot be created", async () => {
  const root = await mkdtemp(join(tmpdir(), "lzc-observation-"));
  roots.push(root);
  await mkdir(join(root, "existing"));
  const observed = vi.fn();
  const stop = watchPlanVersion(
    join(root, "unavailable"),
    () => true,
    observed,
  );
  expect(() => stop()).not.toThrow();
  expect(observed).not.toHaveBeenCalled();
});
