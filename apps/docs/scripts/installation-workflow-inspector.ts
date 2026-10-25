/** Installs the documented global tool into an owned prefix and verifies real UI/history independently of an enabled packed backend's lifetime. */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Effect, Schedule } from "effect";
import { inspectionNative } from "../../../scripts/consumer-installation-native.js";
import { scaffoldChild, ScaffoldProcess } from "../../../scripts/scaffold-process.js";
import {
  awaitScaffoldHttp,
  scaffoldPort,
  scaffoldRequest,
} from "../../../scripts/scaffold-http.js";
import { installationDeclarations } from "./installation-catalog.js";
import { installationRecipes } from "./installation-recipes.js";
import { assertGuideManifest, guideSteps } from "./installation-workflow-guidance.js";
import { workflowCommand, workflowManifest } from "./installation-workflow-project.js";
import { startWorkflowDev } from "./installation-workflow-runtime.js";
import type { InstallationWorkflow } from "./installation-workflows.types.js";

/** Enables only the bridge, installs the standalone tool and proves history survives an offline tool restart.
 * @param context - Exact packed candidate owner.
 * @param app - Previously verified headless minimal app.
 * @returns Completion after native tool shutdown, backend independence and durable history checks.
 */
export const inspectorWorkflow = Effect.fn("DocsInstallation.inspector")(function* (
  context: InstallationWorkflow,
  app: string,
) {
  yield* inspectionNative("docs.enable-bridge", async () => {
    const path = join(app, "relkit.config.ts");
    const source = await readFile(path, "utf8");
    assert(source.includes("defineApp({"));
    await writeFile(
      path,
      source.replace("defineApp({", "defineApp({ inspector: { enabled: true },"),
    );
  });
  yield* workflowCommand(context, app, ["run", "check"]);
  yield* workflowCommand(context, app, ["run", "typecheck"]);
  const prefix = yield* installInspector(context);
  yield* Effect.scoped(
    Effect.gen(function* () {
      const backend = yield* startWorkflowDev(context, app);
      const history = join(app, ".relkit/observability/observability.duckdb");
      assert(!existsSync(history), "Bridge enablement opened tool history");
      yield* Effect.scoped(runInspector(context, prefix, app));
      assert(
        (yield* scaffoldRequest(backend.origin + "/hello")).ok,
        "Stopping the tool stopped the backend",
      );
      const size = yield* inspectionNative("docs.history-size", () => stat(history));
      assert(size.size > 0, "Tool did not persist native DuckDB history");
      yield* Effect.promise(backend.child.release);
      yield* Effect.scoped(runInspector(context, prefix, app));
    }),
  );
  yield* Effect.logInfo(
    "passed: separately installed Inspector UI, persistent history, offline restart and backend independence",
  );
});

/** Runs the literal global installation command with an owned Bun prefix, never the contributor's global directory.
 * @param context - Packed registry and source fragment.
 * @returns Prefix containing the actual global installation.
 */
const installInspector = Effect.fn("DocsInstallation.inspector-install")(function* (
  context: InstallationWorkflow,
) {
  const prefix = join(context.temporary, "inspector");
  const global = join(prefix, "install/global");
  const baseline = { name: "docs-inspector-global", private: true, type: "module" };
  yield* inspectionNative("docs.global-manifest", async () => {
    await mkdir(global, { recursive: true });
    await writeFile(join(global, "package.json"), JSON.stringify(baseline));
  });
  const source = yield* inspectionNative("docs.inspector-guide", () =>
    readFile(
      join(context.repository, "apps/docs/content/_snippets/generated/installations/inspector.mdx"),
      "utf8",
    ),
  );
  for (const step of guideSteps(source)) {
    assert(step.kind === "command");
    yield* (yield* ScaffoldProcess).run({
      cwd: prefix,
      args: [
        "--eval",
        'import { $ } from "bun"; await $`${{ raw: process.argv[1] }}`;',
        step.source,
      ],
      registry: context.registry,
      cacheDir: context.cache,
      env: { BUN_INSTALL: prefix },
    });
  }
  assertGuideManifest(
    baseline,
    yield* workflowManifest(global),
    installationDeclarations(installationRecipes.inspector, context.catalog),
  );
  return prefix;
});

/** Owns a real packed tool process and waits for durable logs, including when its backend is offline.
 * @param context - Candidate child environment.
 * @param prefix - Owned global installation prefix.
 * @param app - Project containing enabled bridge metadata and durable history.
 * @returns Completion after the tool has served its UI and persisted greeting record.
 */
const runInspector = Effect.fn("DocsInstallation.inspector-ui")(function* (
  context: InstallationWorkflow,
  prefix: string,
  app: string,
) {
  const port = yield* scaffoldPort;
  const child = yield* scaffoldChild({
    cwd: app,
    args: [join(prefix, "bin/relkit-inspector"), "--project-root", app, "--port", String(port)],
    registry: context.registry,
    cacheDir: context.cache,
  });
  const origin = `http://127.0.0.1:${port}`;
  yield* awaitScaffoldHttp(child.process, [origin]).pipe(
    Effect.tapError(() =>
      Effect.logError("Installed Inspector startup failed", { output: child.output() }),
    ),
  );
  const logs = scaffoldRequest(origin + "/_relkit/backend/_relkit/v1/logs").pipe(
    Effect.flatMap((response) => Effect.promise(() => response.text())),
    Effect.catchTag("ScaffoldProcessFailure", () => Effect.succeed("")),
    Effect.tap(() => Effect.sync(() => assert(child.process.exitCode === null, child.output()))),
    Effect.repeat({
      until: (body) => body.includes("hello invoked"),
      schedule: Schedule.spaced(100),
    }),
    Effect.timeout("30 seconds"),
  );
  yield* logs;
});
