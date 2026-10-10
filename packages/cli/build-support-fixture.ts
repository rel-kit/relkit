/**
 * Relocates the actual bundler helper and its native Effect dependencies into an
 * owned temporary root. Optional peers remain isolated from workspace packages;
 * every write joins native settlement and real Bun children use scoped process authority.
 */
import { cp, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Effect } from "effect";
import { ownedNativePromise } from "./src/services/owned-promise.js";
import { CliProcess } from "./src/services/process.service.js";
import type { BuildSupportFixture } from "./build-support-fixture.types.js";

/**
 * Captures one real Bun process through owned process-group and bounded pipe authority.
 * @param args - Fixture-owned Bun arguments; no shell interpolation occurs.
 * @param cwd - Current isolated fixture directory.
 * @returns Joined child status/stdout/stderr or typed acquisition/read/reap failure.
 */
export const runFixtureBun = Effect.fn("BuildSupportTest.run")(
  (args: readonly string[], cwd: string) =>
    CliProcess.use((processes) => processes.run({ command: process.execPath, args, cwd })),
);

/**
 * Builds an isolated accepted fixture and registers cleanup before writing anything.
 * @returns Complete fixture requiring Scope and process authority at execution time.
 */
export const createBuildSupportFixture = Effect.fn("BuildSupportTest.create")(function* () {
  const root = yield* Effect.acquireRelease(
    ownedNativePromise("test.fixture", () =>
      mkdtemp(join(tmpdir(), "relkit-build-optional-peer-")),
    ),
    (root) =>
      ownedNativePromise("test.cleanup", () => rm(root, { recursive: true, force: true })).pipe(
        Effect.orDie,
      ),
  );
  const helper = join(root, "cli/src/commands/build-support.ts");
  const modules = join(root, "cli/node_modules");
  const server = join(root, "server");
  yield* copyHelperFiles(root);
  yield* seedRuntime(modules, server);
  return {
    root,
    modules,
    server,
    build: (development) =>
      runFixtureBun(
        [
          "-e",
          `import { bundleServer } from ${JSON.stringify(helper)};\nawait bundleServer(${JSON.stringify(server)}, ${JSON.stringify(root)}, ${development});`,
        ],
        root,
      ),
    prepare: () =>
      runFixtureBun(
        [
          "-e",
          `
import { Effect, Layer } from "effect";
import { bundleServerEffect } from ${JSON.stringify(helper)};
import { fileSystemLayer } from ${JSON.stringify(join(root, "cli/src/services/filesystem.service.ts"))};
import { processLayer } from ${JSON.stringify(join(root, "cli/src/services/process.service.ts"))};
import { cleanupLayer } from ${JSON.stringify(join(root, "cli/src/services/cleanup.service.ts"))};
await Effect.runPromise(bundleServerEffect(${JSON.stringify(server)}, ${JSON.stringify(root)}, false, "bun.inputs.json").pipe(Effect.provide(Layer.mergeAll(fileSystemLayer, processLayer, cleanupLayer))));
`,
        ],
        modules,
      ),
  } satisfies BuildSupportFixture;
});

/**
 * Copies the complete helper dependency cohort, including pure emitter companions.
 * @param root - Owned fixture root.
 * @returns Joined copy operation or typed native failure; no workspace peer is copied.
 */
function copyHelperFiles(root: string) {
  return ownedNativePromise("test.helper", async (signal) => {
    for (const relative of [
      "commands/build-support.ts",
      "commands/build-container.ts",
      "cli-errors.ts",
      "cli-runtime.ts",
      "cli-runtime.types.ts",
      "cli-cleanup-evidence.ts",
      "cli-cleanup-presentation.ts",
      "services/filesystem.service.ts",
      "services/filesystem.types.ts",
      "services/filesystem-exclusive.ts",
      "services/filesystem-exclusive.types.ts",
      "services/process.service.ts",
      "services/process.types.ts",
      "services/cleanup.service.ts",
      "services/cleanup.types.ts",
    ]) {
      signal.throwIfAborted();
      const target = join(root, "cli/src", relative);
      await mkdir(dirname(target), { recursive: true });
      await cp(join(import.meta.dir, "src", relative), target);
    }
  });
}

/**
 * Seeds only the helper's runtime peers and a synthetic optional-agent dependency.
 * @param modules - Fixture-only module resolution root.
 * @param server - Owned emitted source directory.
 * @returns Joined native preparation retaining the established missing-peer behavior.
 */
function seedRuntime(modules: string, server: string) {
  return ownedNativePromise("test.runtime", async (signal) => {
    await mkdir(join(modules, "@relkit/agents"), { recursive: true });
    await mkdir(server);
    for (const name of ["effect", "@relkit/contracts", "@relkit/runtime-effect"]) {
      const target = join(modules, name);
      await mkdir(dirname(target), { recursive: true });
      await symlink(await realpath(join(import.meta.dir, "node_modules", name)), target, "dir");
    }
    await writeFile(
      join(modules, "@relkit/agents/package.json"),
      JSON.stringify({ name: "@relkit/agents", type: "module", exports: "./index.js" }),
      { signal },
    );
    await writeFile(
      join(modules, "@relkit/agents/index.js"),
      'export const load = () => import("deepagents");',
      { signal },
    );
    await writeFile(
      join(server, "index.ts"),
      `import { load } from "@relkit/agents";
if (process.argv[2] === "invoke") {
  try { console.log((await load()).value); }
  catch { console.log("optional dependency unavailable"); }
} else console.log("ready");
`,
      { signal },
    );
  });
}
