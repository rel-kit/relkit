/** Creates native minimal consumers and applies literal generated install blocks through ScaffoldProcess; no workspace modules or example manifests enter these projects. */
import assert from "node:assert/strict";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Effect, Schema } from "effect";
import { inspectionNative } from "../../../scripts/consumer-installation-native.js";
import { ScaffoldProcess } from "../../../scripts/scaffold-process.js";
import { installationDeclarations } from "./installation-catalog.js";
import { installationRecipes } from "./installation-recipes.js";
import { GuideManifest } from "./installation-workflows.schemas.js";
import {
  assertGuideManifest,
  guideSteps,
  mergeGuideRepair,
  verifyConsumerIsolation,
} from "./installation-workflow-guidance.js";
import type { InstallationWorkflow } from "./installation-workflows.types.js";
import type { InstallationRecipe } from "./installation-catalog.types.js";

/** Reads actual application bytes at the manifest boundary.
 * @param app - Owned application directory.
 * @returns Decoded JSON fields, preserving unrelated authored settings.
 */
export const workflowManifest = Effect.fn("DocsInstallation.manifest")(function* (app: string) {
  return yield* Schema.decodeUnknownEffect(Schema.fromJsonString(GuideManifest))(
    yield* inspectionNative("docs.manifest-read", () =>
      readFile(join(app, "package.json"), "utf8"),
    ),
  );
});

/** Runs one finite child with the candidate registry and isolated cache.
 * @param context - Shared candidate owner.
 * @param app - Independent installed consumer.
 * @param args - Literal Bun argument vector.
 * @returns Complete stdout; failed commands retain their native diagnostics.
 */
export const workflowCommand = Effect.fn("DocsInstallation.command")(function* (
  context: InstallationWorkflow,
  app: string,
  args: readonly string[],
) {
  const output = yield* (yield* ScaffoldProcess).run({
    cwd: app,
    args,
    registry: context.registry,
    cacheDir: context.cache,
    env: {
      NODE_OPTIONS: "--max-old-space-size=2048",
      DATABASE_PATH: join(app, "orders.sqlite"),
      BETTER_AUTH_SECRET: "docs-installation-test-secret-123456789012345",
      BETTER_AUTH_URL: "http://127.0.0.1:3000",
    },
  });
  yield* Effect.logInfo(`passed: ${args.join(" ")}`, { app });
  return output;
});

/** Creates the offered tuple with the packed public CLI, then completes its documented deferred install.
 * @param context - Current packed cohort.
 * @param name - Unique sibling project name.
 * @returns An installed outside-workspace minimal app.
 */
export const createWorkflowProject = Effect.fn("DocsInstallation.create")(function* (
  context: InstallationWorkflow,
  name: string,
) {
  const app = join(context.temporary, name);
  yield* workflowCommand(context, context.temporary, [
    context.creator,
    name,
    "--directory",
    app,
    "--template",
    "minimal",
    "--cloud",
    "none",
    "--deploy",
    "none",
    "--no-install",
    "--no-git",
    "--json",
  ]);
  yield* workflowCommand(context, app, ["install"]);
  return app;
});

/** Applies selected guides in order and proves the native manifest contains only their declarations.
 * @param context - Current candidate metadata and registry.
 * @param app - Owned installed consumer.
 * @param name - Actual generated recipe consumed by a guide.
 * @returns Completion after commands and selected manifest checks pass.
 */
export const installWorkflowGuide = Effect.fn("DocsInstallation.guide")(function* (
  context: InstallationWorkflow,
  app: string,
  name: keyof typeof installationRecipes,
) {
  let baseline = yield* workflowManifest(app);
  const source = yield* inspectionNative("docs.guide-read", () =>
    readFile(
      join(context.repository, `apps/docs/content/_snippets/generated/installations/${name}.mdx`),
      "utf8",
    ),
  );
  const recipe: InstallationRecipe = installationRecipes[name];
  assert(!recipe.global, "Global tool installation has its own owned prefix");
  for (const step of guideSteps(source)) {
    if (step.kind === "repair") {
      baseline = mergeGuideRepair(baseline, step.fields);
      const current = mergeGuideRepair(yield* workflowManifest(app), step.fields);
      yield* inspectionNative("docs.guide-repair", () =>
        writeFile(join(app, "package.json"), JSON.stringify(current, null, 2) + "\n"),
      );
    } else {
      yield* workflowCommand(context, app, [
        "--eval",
        'import { $ } from "bun"; await $`${{ raw: process.argv[1] }}`;',
        step.source,
      ]);
    }
  }
  assertGuideManifest(
    baseline,
    yield* workflowManifest(app),
    installationDeclarations(recipe, context.catalog),
  );
});

/** Copies only a guide's maintained source file, never node_modules or package manifests.
 * @param context - Checkout containing the authored example.
 * @param app - Owned consumer destination.
 * @param source - Repository-relative canonical source path.
 * @param destination - Application-relative file path.
 * @returns Completion after an ordinary source copy.
 */
export const copyWorkflowSource = Effect.fn("DocsInstallation.source")(
  (context: InstallationWorkflow, app: string, source: string, destination: string) =>
    inspectionNative("docs.source-copy", async () => {
      assert(!source.includes("node_modules") && !source.endsWith("package.json"));
      const target = join(app, destination);
      await mkdir(dirname(target), { recursive: true });
      await cp(join(context.repository, source), target, { recursive: true });
    }),
);

/** Establishes capability absence from an actual native installation.
 * @param context - Workspace excluded from consumer resolution.
 * @param app - Installed outside-workspace consumer.
 * @param forbidden - Unselected package identities.
 * @returns Completion after physical containment and required dependency checks.
 */
export const verifyWorkflowClosure = Effect.fn("DocsInstallation.closure")(function* (
  context: InstallationWorkflow,
  app: string,
  forbidden: RegExp,
) {
  const installation = yield* verifyConsumerIsolation(app, context.repository, forbidden);
  const mismatches = installation.instances.filter((item) => {
    const owner = context.catalog.packages.get(item.name);
    return owner !== undefined && item.version !== owner.version;
  });
  assert.deepEqual(mismatches, [], "Installed first-party cohort differs from its owners");
  yield* Effect.logInfo("passed: contained selected dependency closure", {
    app,
    packages: installation.instances.length,
  });
});
