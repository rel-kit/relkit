/** Reuses scaffold child/listener ownership for development proofs and the tutorial's production HTTP owner for durable Orders acceptance. */
import { join } from "node:path";
import { Effect } from "effect";
import { scaffoldChild } from "../../../scripts/scaffold-process.js";
import { awaitScaffoldHttp, scaffoldPort } from "../../../scripts/scaffold-http.js";
import type { TutorialProject } from "./orders-tutorial.types.js";
import type { InstallationWorkflow } from "./installation-workflows.types.js";

/** Constructs the existing tutorial resource contract without acquiring its workspace-linked fixture.
 * @param context - Packed candidate owner.
 * @param app - Independently installed consumer.
 * @returns The existing source-overlay/production-verifier input.
 */
export function workflowTutorial(context: InstallationWorkflow, app: string): TutorialProject {
  return {
    root: context.repository,
    parent: context.temporary,
    app,
    env: {
      ...process.env,
      DATABASE_PATH: join(app, "orders.sqlite"),
      BETTER_AUTH_SECRET: "docs-installation-test-secret-123456789012345",
      BETTER_AUTH_URL: "http://127.0.0.1:3000",
    },
  };
}

/** Starts a real installed dev app with a dynamic listener inside the caller's Scope.
 * @param context - Candidate registry and cache.
 * @param app - Consumer whose check/typecheck has completed.
 * @returns Actual backend origin and existing scope-owned child after HTTP readiness.
 */
export const startWorkflowDev = Effect.fn("DocsInstallation.dev")(function* (
  context: InstallationWorkflow,
  app: string,
) {
  const port = yield* scaffoldPort;
  const child = yield* scaffoldChild({
    cwd: app,
    args: ["run", "dev", "--", "--port", String(port)],
    registry: context.registry,
    cacheDir: context.cache,
  });
  const origin = `http://127.0.0.1:${port}`;
  yield* awaitScaffoldHttp(child.process, [origin + "/hello"]).pipe(
    Effect.tapError(() =>
      Effect.logError("Installed backend startup failed", { output: child.output() }),
    ),
  );
  return { origin, child };
});
