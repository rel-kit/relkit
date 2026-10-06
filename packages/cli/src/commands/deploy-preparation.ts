import { join, resolve } from "node:path";
import { Effect } from "effect";
import { assertDeploymentPlanVersion, fromGraph } from "@relkit/deploy";
import { createPulumiProgram } from "@relkit/deploy-pulumi";
import { validateGraphShape, type ApplicationGraph } from "@relkit/graph";
import { cliOriginalError, cliPromise, cliTry } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import { CliProject } from "../services/project.service.js";
import { CliFileSystem } from "../services/filesystem.service.js";
import { CliPulumi } from "../services/pulumi.service.js";
import { ownedNativePromise } from "../services/owned-promise.js";
import {
  deploymentIntegrationEntries,
  loadDeploymentIntegrationsEffect,
} from "./deployment-integrations.js";
import { DeployCommandError } from "./deploy-support.js";
import type { BuildResult } from "./build.js";
import type { CheckResult } from "./check.js";
import type { DeployCommandOptions, ParsedDeployArgs, Prepared } from "./deploy-support.types.js";

/**
 * Checks, plans, and writes one coherent deployment program before SDK mutation.
 * @param root - Absolute authored project root.
 * @param parsed - Selected command/backend/configuration.
 * @param options - Optional public compatibility adapter overrides.
 * @returns The accepted plan, previous plan, and generated program.
 */
export const prepareDeploymentEffect = Effect.fn("Deployment.prepare")(
  function* (root: string, parsed: ParsedDeployArgs, options: DeployCommandOptions) {
    const project = yield* CliProject;
    const sdk = yield* CliPulumi;
    const checked =
      options.check === undefined
        ? yield* project.check({ projectRoot: root, mode: "production" })
        : yield* ownedNativePromise("deployment.customCheck", (signal) =>
            options.check!({ projectRoot: root, mode: "production", signal }),
          );
    if (!checked.ok || checked.graphHash === undefined)
      return yield* Effect.fail(
        new DeployCommandError("RELKIT_DEPLOY_CHECK_FAILED", checkFailure(checked)),
      );
    const graph = yield* cliTry("deployment.graph", () =>
      checkedGraph(checked.outputs.graph, root),
    );
    const plan = yield* cliTry("deployment.plan", () =>
      fromGraph(graph, {
        ...(checked.config?.server.port === undefined
          ? {}
          : { httpPort: checked.config.server.port }),
      }),
    );
    if (plan.graphHash !== checked.graphHash)
      return yield* Effect.fail(
        new DeployCommandError(
          "RELKIT_DEPLOY_CHECK_FAILED",
          "The checked graph changed before planning.",
        ),
      );
    const integrations =
      options.loadIntegrations === undefined
        ? yield* loadDeploymentIntegrationsEffect(root, plan)
        : yield* cliPromise("deployment.customIntegrations", () =>
            options.loadIntegrations!(root, plan),
          ).pipe(Effect.uninterruptible);
    if (parsed.command === "preview" || parsed.command === "up") {
      const built =
        options.build === undefined
          ? yield* project.build({ projectRoot: root, check: async () => checked })
          : yield* ownedNativePromise("deployment.customBuild", (signal) =>
              options.build!({ projectRoot: root, signal, check: async () => checked }),
            );
      if (!built.ok)
        return yield* Effect.fail(
          new DeployCommandError("RELKIT_DEPLOY_BUILD_FAILED", checkFailure(built)),
        );
    }
    const previousPlan = yield* readDeploymentPlanEffect(
      join(resolve(root, ".relkit/generated/pulumi"), "plan.json"),
    );
    const entries = deploymentIntegrationEntries(integrations);
    const files = yield* sdk.writeProgram(plan, {
      projectRoot: root,
      projectName: plan.application.id,
      stackName: parsed.stack,
      integrations: entries.map((entry) => entry.metadata),
      integrationImports: entries.map(({ metadata, packageName, packageVersion, exportName }) => ({
        integrationId: metadata.integrationId,
        role: metadata.role,
        packageName,
        packageVersion,
        exportName,
      })),
    });
    return {
      root,
      plan,
      ...(previousPlan === undefined ? {} : { previousPlan }),
      files,
      integrations,
    } satisfies Prepared;
  },
  (effect, _root: string, _parsed: ParsedDeployArgs, _options: DeployCommandOptions) =>
    observeCli("deployment.prepare", effect),
);

/**
 * Opens only the workspace selected by validated deployment arguments.
 * @param prepared - Accepted generated program and integration cohort.
 * @param parsed - Stack, backend, mode, and private configuration.
 * @returns A native workspace handle; SDK initialization settles before cancellation returns.
 */
export const openDeploymentWorkspaceEffect = Effect.fn("Deployment.openWorkspace")(
  function* (prepared: Prepared, parsed: ParsedDeployArgs) {
    const sdk = yield* CliPulumi;
    const entries = deploymentIntegrationEntries(prepared.integrations);
    const program = yield* cliTry("deployment.inlineProgram", () =>
      createPulumiProgram(prepared.plan, {
        projectName: prepared.plan.application.id,
        stackName: parsed.stack,
        projectRoot: prepared.root,
        directory: ".relkit/generated/pulumi",
        integrations: entries.map((entry) => entry.metadata),
      }),
    );
    return yield* sdk.openWorkspace({
      projectName: prepared.plan.application.id,
      stackName: parsed.stack,
      workDir: prepared.files.directory,
      backend: parsed.backend,
      mode: parsed.command === "init" ? "create-or-select" : "select",
      program,
      ...(Object.keys(parsed.config).length === 0 ? {} : { config: parsed.config }),
    });
  },
  (effect, _prepared: Prepared, _parsed: ParsedDeployArgs) =>
    observeCli("deployment.openWorkspace", effect),
);

/**
 * Reads and validates a prior plan; only an absent file has no previous cohort.
 * @param path - Generated prior-plan location.
 * @returns An accepted previous plan or absence.
 */
const readDeploymentPlanEffect = Effect.fn("Deployment.readPlan")(
  function* (path: string) {
    const files = yield* CliFileSystem;
    const source = yield* files.readText(path).pipe(
      Effect.catchTag("CliAdapterError", (error) => {
        const cause = cliOriginalError(error);
        return cause instanceof Error && "code" in cause && cause.code === "ENOENT"
          ? Effect.succeed(undefined)
          : Effect.fail(error);
      }),
    );
    if (source === undefined) return undefined;
    return yield* cliTry("deployment.previousPlan", () => {
      let value: unknown;
      try {
        value = JSON.parse(source);
      } catch {
        throw new DeployCommandError(
          "RELKIT_DEPLOY_PLAN_INVALID",
          `Deployment plan is invalid JSON; regenerate with \`relkit deploy preview\`: ${path}`,
        );
      }
      assertDeploymentPlanVersion(value);
      return value;
    });
  },
  (effect, _path: string) => observeCli("deployment.readPlan", effect),
);

/** Projects failed preparation diagnostics into stable public failure codes.
 * @param result - Failed compiler/build evidence.
 * @returns Existing code-only failure summary without native payloads.
 */
function checkFailure(result: CheckResult | BuildResult): string {
  const codes = result.diagnostics.map((diagnostic) => diagnostic.code).filter(Boolean);
  return codes.length === 0
    ? "The project check did not succeed."
    : `Project check failed: ${codes.join(", ")}.`;
}

/**
 * Promotes compiler bytes through the graph owner's complete assertion boundary.
 * @param source - Checked graph JSON.
 * @param root - Authored root used by source validation.
 * @returns The accepted graph; the owner exposes a void validator, requiring this one assertion.
 */
function checkedGraph(source: string, root: string): ApplicationGraph {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new DeployCommandError(
      "RELKIT_DEPLOY_GRAPH_INVALID",
      "The checked graph is invalid JSON.",
    );
  }
  validateGraphShape(value, root);
  return value as ApplicationGraph;
}
