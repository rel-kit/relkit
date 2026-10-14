/** Captures command authority for grouped project verification and exposes finite Promise edges to packed acceptance callers. */
import { Context, Effect, Layer } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { ScaffoldProcess, scaffoldProcessLayer } from "./scaffold-process.js";
import { projectSnapshot, verifyProjectFiles } from "./scaffold-project-files.js";
import { devSmokeAttempt } from "./pack-and-smoke-create-relkit-dev.js";
import type { ProjectSnapshot } from "./scaffold-process.types.js";
export type { Manifest } from "./scaffold-process.types.js";

/** Installed command authority is captured once; each development child owns its own scope. */
class ScaffoldProject extends Context.Service<ScaffoldProject>()("relkit.scripts.ScaffoldProject", {
  make: Effect.gen(function* () {
    const process = yield* ScaffoldProcess;
    return {
      verify: (
        root: string,
        registry: string,
        cacheDir: string,
        exercise?: (port: number) => Promise<void>,
      ) =>
        observeExecution(
          "testing",
          "scaffold.project",
          verifyInstalledProject(process.run, root, registry, cacheDir, exercise),
        ),
    };
  }),
}) {}
const projectLayer = Layer.effect(ScaffoldProject, ScaffoldProject.make).pipe(
  Layer.provide(scaffoldProcessLayer),
);

/**
 * Checks a real installed project before starting backend and packaged Inspector.
 * @param run - Captured finite command capability.
 * @param root - Standalone application.
 * @param registry - Exact candidate package registry.
 * @param cacheDir - Isolated install cache.
 * @param exercise - Optional caller-owned public HTTP acceptance callback.
 * @returns Completion after frozen install, check/typecheck and owned native development runs.
 */
const verifyInstalledProject = Effect.fn("ScaffoldProject.verify")(function* (
  run: Effect.Success<typeof ScaffoldProcess.make>["run"],
  root: string,
  registry: string,
  cacheDir: string,
  exercise?: (port: number) => Promise<void>,
) {
  const tasks = yield* verifyProjectFiles(root);
  yield* run({
    args: ["install", "--frozen-lockfile", "--registry", registry],
    cwd: root,
    registry,
    cacheDir,
  });
  for (const script of ["check", "typecheck"]) yield* run({ args: ["run", script], cwd: root });
  if (!tasks || process.env.RELKIT_TEST_DOCKER === "1")
    for (let attempt = 0; attempt < (exercise === undefined ? 1 : 2); attempt++)
      yield* devSmokeAttempt(root, exercise);
});

/**
 * Runs one native Bun command with complete child/output settlement.
 * @param args - Literal Bun argument vector.
 * @param cwd - Standalone project root.
 * @param registry - Optional candidate registry.
 * @param cacheDir - Optional isolated install cache.
 * @returns Complete stdout after owned command cleanup.
 */
export function runCommand(
  args: string[],
  cwd: string,
  registry?: string,
  cacheDir?: string,
): Promise<string> {
  return Effect.runPromise(
    Effect.flatMap(ScaffoldProcess, (process) =>
      process.run({
        args,
        cwd,
        ...(registry === undefined ? {} : { registry }),
        ...(cacheDir === undefined ? {} : { cacheDir }),
      }),
    ).pipe(Effect.provide(scaffoldProcessLayer)),
  );
}

/**
 * Exposes deterministic file inventory at the native script boundary.
 * @param root - Standalone application root.
 * @param current - Recursive directory, initially the root.
 * @returns Exact normalized bytes and modes after all reads settle.
 */
export function snapshotProject(root: string, current = root): Promise<ProjectSnapshot> {
  return Effect.runPromise(projectSnapshot(root, current));
}

/**
 * Exposes real installed application acceptance at the script boundary.
 * @param root - Standalone application.
 * @param registry - Exact candidate registry.
 * @param cacheDir - Isolated installation cache.
 * @param exercise - Optional public HTTP acceptance callback.
 * @returns Completion after every owned native development child has terminated.
 */
export function verifyProject(
  root: string,
  registry: string,
  cacheDir: string,
  exercise?: (port: number) => Promise<void>,
): Promise<void> {
  return Effect.runPromise(
    Effect.flatMap(ScaffoldProject, (project) =>
      project.verify(root, registry, cacheDir, exercise),
    ).pipe(Effect.provide(projectLayer)),
  );
}
