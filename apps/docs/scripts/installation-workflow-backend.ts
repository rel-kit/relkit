/** Proves minimal, manual SQLite/auth and offline native-agent guides using one packed cohort; overlays copy only the maintained tutorial sources. */
import assert from "node:assert/strict";
import { Effect } from "effect";
import { scaffoldPort } from "../../../scripts/scaffold-http.js";
import { startTutorialServer } from "./orders-tutorial-process.js";
import { workflowTutorial } from "./installation-workflow-runtime.js";
import {
  createWorkflowProject,
  workflowCommand,
  verifyWorkflowClosure,
} from "./installation-workflow-project.js";
import type { InstallationWorkflow } from "./installation-workflows.types.js";

/** Native UI/history/model owners are absent; the lightweight inspector-api protocol remains valid. */
export const headlessForbiddenPackages =
  /^(?:next$|@duckdb\/|@relkit\/(?:inspector|observability-local|langchain)$|langchain$|deepagents$|@langchain\/)/;

/** Runs the generated application's ordinary scripts with real installed dependencies.
 * @param context - Exact candidate registry.
 * @param app - Installed consumer.
 * @returns Completion after check, strict source types, tests and production build.
 */
export const checkWorkflowBackend = Effect.fn("DocsInstallation.backend-checks")(
  (context: InstallationWorkflow, app: string) =>
    Effect.forEach(
      ["check", "typecheck", "test", "build"],
      (script) => workflowCommand(context, app, ["run", script]),
      { concurrency: 1, discard: true },
    ),
);

/** Establishes a working headless production backend without rich tools or native agent SDKs.
 * @param context - Shared exact packed cohort.
 * @returns Installed minimal application, reused only as the frontend contract source.
 */
export const minimalWorkflow = Effect.fn("DocsInstallation.minimal")(function* (
  context: InstallationWorkflow,
) {
  const app = yield* createWorkflowProject(context, "minimal");
  yield* checkWorkflowBackend(context, app);
  yield* verifyWorkflowClosure(context, app, headlessForbiddenPackages);
  yield* Effect.scoped(
    Effect.gen(function* () {
      const port = yield* scaffoldPort;
      const server = yield* startTutorialServer(
        workflowTutorial(context, app),
        `http://127.0.0.1:${port}`,
      );
      const result = yield* Effect.tryPromise(() =>
        fetch(server.origin + "/hello?name=Docs").then((response) => response.json()),
      );
      assert.deepEqual(result, { message: "Hello, Docs!" });
    }),
  );
  return app;
});
