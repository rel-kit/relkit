/** Inventories deterministic scaffold bytes and checks the concrete grouped starter files without loading descriptors. */
import { access, readFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { Effect } from "effect";
import { scaffoldNative } from "./scaffold-native.js";
import type { ProjectSnapshot, ProjectSnapshotOperation } from "./scaffold-process.types.js";

/**
 * Recursively records exact bytes and modes while normalizing only physical root provenance.
 * @param root - Owned project root used for provenance normalization.
 * @param current - Current recursive directory, initially the root.
 * @param includeRuntime - Whether persistent and generated .relkit bytes participate in this snapshot.
 * @returns A sorted file snapshot excluding dependencies and nondeterministic bundled server bytes.
 */
export const projectSnapshot: ProjectSnapshotOperation = Effect.fn("ScaffoldProject.snapshot")(
  function* (root: string, current = root, includeRuntime = true) {
    const result: ProjectSnapshot = {};
    const entries = yield* scaffoldNative("snapshot.directory", () =>
      readdir(current, { withFileTypes: true }),
    );
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (["node_modules", ".git", ".next", "bun.lock"].includes(entry.name)) continue;
      if (!includeRuntime && entry.name === ".relkit") continue;
      const path = join(current, entry.name);
      if (entry.isDirectory())
        Object.assign(result, yield* projectSnapshot(root, path, includeRuntime));
      else if (entry.isFile()) {
        const name = relative(root, path).replaceAll("\\", "/");
        if (name === ".relkit/build/server/index.js") continue;
        const bytes = yield* scaffoldNative("snapshot.bytes", () => readFile(path));
        const metadata = yield* scaffoldNative("snapshot.mode", () => stat(path));
        result[name] = {
          mode: metadata.mode & 0o777,
          content: /\.(?:json|lock|md|toml|ts|tsx|js|jsx|yaml|yml)$/.test(name)
            ? bytes.toString("utf8").replaceAll(root, "<project>")
            : bytes.toString("base64"),
        };
      }
    }
    return result;
  },
);

/**
 * Checks authored and installed starter contracts without discovering optional clients.
 * @param root - Installed standalone application.
 * @returns Whether the explicit tasks starter is present, after every required file is accessible.
 */
export const verifyProjectFiles = Effect.fn("ScaffoldProject.files")(function* (root: string) {
  const tasks = existsSync(join(root, "src/services/orders/tasks/export-orders.task.ts"));
  const required = tasks
    ? [
        "src/services/orders/functions/health.function.ts",
        "src/services/orders/service.ts",
        "src/services/orders/tasks/export-orders.task.ts",
        "src/services/orders/jobs/export-orders.job.ts",
        "src/routes/health/route.ts",
        "tests/unit/export-orders.task.test.ts",
      ]
    : [
        "src/services/hello/functions/hello.function.ts",
        "src/services/hello/service.ts",
        "src/routes/hello/route.ts",
        "tests/integration/hello.route.test.ts",
      ];
  for (const file of [
    "package.json",
    "bun.lock",
    "relkit.config.ts",
    "src/platform/env.ts",
    ...required,
    ".gitignore",
  ])
    yield* scaffoldNative("project.file", () => access(join(root, file)));
  return tasks;
});

/**
 * Compares distributed authored files without comparing root-specific prepared execution cohorts.
 * @param root - Owned generated application.
 * @returns Authored bytes/modes, including local skill guidance and configuration.
 * @remarks Generated and persistent .relkit files are checked separately by compilation, runtime and migration acceptance.
 */
export const authoredProjectSnapshot = Effect.fn("ScaffoldProject.authoredSnapshot")(function* (
  root: string,
) {
  return yield* projectSnapshot(root, root, false);
});
