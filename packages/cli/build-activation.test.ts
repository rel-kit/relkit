import { expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { activateBuild } from "./src/commands/build-activation.js";

test("keeps the last-known-good build when staged activation fails", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-build-activation-"));
  try {
    const build = join(root, "build");
    const worker = join(build, "jobs", "old-build", "generation", "worker.js");
    await mkdir(join(build, "jobs", "old-build", "generation"), { recursive: true });
    await writeFile(join(build, "application.graph.json"), "old-graph");
    await writeFile(worker, "old-worker");

    await expect(activateBuild(join(root, "missing-stage"), build)).rejects.toThrow();

    expect(await readFile(join(build, "application.graph.json"), "utf8")).toBe("old-graph");
    expect(await readFile(worker, "utf8")).toBe("old-worker");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("activates a complete staged build and replaces the old cohort", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-build-activation-"));
  try {
    const build = join(root, "build");
    const stage = join(root, "stage");
    await mkdir(build, { recursive: true });
    await mkdir(stage, { recursive: true });
    await writeFile(join(build, "manifest.json"), "old");
    await writeFile(join(stage, "manifest.json"), "new");

    await activateBuild(stage, build);

    expect(await readFile(join(build, "manifest.json"), "utf8")).toBe("new");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
