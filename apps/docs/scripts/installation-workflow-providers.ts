/** Checks selected provider/configuration and deployment phases with packed installs; it never starts Docker, contacts cloud APIs or certifies native job execution. */
import assert from "node:assert/strict";
import { join } from "node:path";
import { Effect, Schema } from "effect";
import { installationDeclarations } from "./installation-catalog.js";
import { installationRecipes } from "./installation-recipes.js";
import {
  createWorkflowProject,
  copyWorkflowSource,
  installWorkflowGuide,
  workflowCommand,
  workflowManifest,
  verifyWorkflowClosure,
} from "./installation-workflow-project.js";
import type { InstallationWorkflow } from "./installation-workflows.types.js";

/** Checks the module setup examples against the already installed provider cohort.
 * @param context - Exact candidate packages and maintained source files.
 * @param app - Owned consumer with the selected integration dependencies.
 * @returns Completion after each configuration passes graph and TypeScript checks.
 */
const setupConfigurations = Effect.fn("DocsInstallation.setup-configurations")(function* (
  context: InstallationWorkflow,
  app: string,
) {
  for (const name of [
    "storage",
    "caching",
    "realtime",
    "agents",
    "events",
    "http",
    "telemetry",
    "connected",
    "cloudflare",
  ]) {
    yield* copyWorkflowSource(
      context,
      app,
      `apps/docs/examples/setup/${name}.ts`,
      "relkit.config.ts",
    );
    yield* workflowCommand(context, app, ["run", "check"]);
    yield* workflowCommand(context, app, ["run", "typecheck"]);
  }
});

/** Typechecks each maintained provider config, then builds the documented commerce resource/deployment selections.
 * @param context - One exact candidate cohort and private registry.
 * @returns Completion after package/configuration and production-closure phase checks.
 */
export const providersWorkflow = Effect.fn("DocsInstallation.providers")(function* (
  context: InstallationWorkflow,
) {
  const app = yield* createWorkflowProject(context, "providers");
  yield* Effect.forEach(
    ["inngest", "effect-mq", "trigger"] as const,
    (name) =>
      Effect.gen(function* () {
        yield* installWorkflowGuide(context, app, name);
        yield* copyWorkflowSource(
          context,
          app,
          `apps/docs/examples/jobs/providers/${name}-config.ts`,
          "relkit.config.ts",
        );
        yield* workflowCommand(context, app, ["run", "check"]);
        yield* workflowCommand(context, app, ["run", "typecheck"]);
      }),
    { concurrency: 1 },
  );
  yield* Effect.forEach(
    ["redis", "s3", "cloudflare", "otlp", "sentry", "deployment", "scalar"] as const,
    (name) => installWorkflowGuide(context, app, name),
    { concurrency: 1 },
  );
  yield* copyWorkflowSource(context, app, "examples/commerce/relkit.config.ts", "relkit.config.ts");
  yield* workflowCommand(context, app, ["run", "check"]);
  yield* workflowCommand(context, app, ["run", "typecheck"]);
  yield* workflowCommand(context, app, ["run", "build"]);
  yield* workflowCommand(context, app, ["--eval", 'await import("@relkit/cloudflare");']);
  yield* setupConfigurations(context, app);
  yield* verifyWorkflowClosure(
    context,
    app,
    /^(?:next|langchain|deepagents|@langchain\/.*|@relkit\/(?:inspector|langchain|better-auth))$/,
  );
  const production = yield* workflowManifest(join(app, ".relkit/build"));
  const dependencies = Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.String))(
    production.dependencies ?? {},
  );
  const deployment = installationDeclarations(installationRecipes.deployment, context.catalog);
  for (const name of Object.keys(deployment.devDependencies))
    assert(!(name in dependencies), `${name} entered the production closure`);
  yield* Effect.logInfo(
    "passed: provider/configuration and deploy-only package phase checks; native execution remains unverified",
  );
});
