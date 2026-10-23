/** Prepares selected deployment implementations and deterministic programs. */
import { join, resolve } from "node:path";
import { Effect } from "effect";
import { fromGraph } from "@relkit/deploy";
import { Schema } from "effect";
import { deploymentEngineSchema } from "./deployment-engine.schemas.js";
import { cliPromise, cliTry } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import { CliProject } from "../services/project.service.js";
import { CliPulumi } from "../services/pulumi.service.js";
import { ownedNativePromise } from "../services/owned-promise.js";
import {
  deploymentIntegrationEntries,
  loadDeploymentIntegrationsEffect,
} from "./deployment-integrations.js";
import {
  readDeploymentPlanEffect,
  checkedGraph,
  checkFailure,
} from "./deploy-preparation-input.js";
import { DeployCommandError } from "./deploy-support.js";
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
    const sdk = yield* CliPulumi;
    const { checked, plan } = yield* checkedDeploymentEffect(root, options);
    const integrations =
      options.loadIntegrations === undefined
        ? yield* loadDeploymentIntegrationsEffect(root, plan)
        : yield* cliPromise("deployment.customIntegrations", () =>
            options.loadIntegrations!(root, plan),
          ).pipe(Effect.uninterruptible);
    yield* buildDeploymentEffect(root, parsed, options, checked);
    const previousPlan = yield* readDeploymentPlanEffect(
      join(resolve(root, ".relkit/generated/pulumi"), "plan.json"),
    );
    const entries = deploymentIntegrationEntries(integrations);
    const engine = yield* cliTry("deployment.engine", () =>
      Schema.decodeUnknownSync(deploymentEngineSchema)(integrations.engine.module),
    );
    const files = yield* sdk.writeProgram(engine, plan, {
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
      engine,
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
      prepared.engine.createPulumiProgram(prepared.plan, {
        projectName: prepared.plan.application.id,
        stackName: parsed.stack,
        projectRoot: prepared.root,
        directory: ".relkit/generated/pulumi",
        integrations: entries.map((entry) => entry.metadata),
      }),
    );
    return yield* sdk.openWorkspace(prepared.engine, {
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

/** Produces one coherent checked deployment plan before native implementation selection. */
const checkedDeploymentEffect = Effect.fn("Deployment.checkedPlan")(
  function* (root: string, options: DeployCommandOptions) {
    const project = yield* CliProject;
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
    return { checked, plan };
  },
  (effect) => observeCli("deployment.checkedPlan", effect),
);

/** Builds only operations that execute a deployment program, retaining cancellation. */
const buildDeploymentEffect = Effect.fn("Deployment.buildProgram")(
  function* (
    root: string,
    parsed: ParsedDeployArgs,
    options: DeployCommandOptions,
    checked: CheckResult,
  ) {
    if (parsed.command === "preview" || parsed.command === "up") {
      const project = yield* CliProject;
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
  },
  (effect) => observeCli("deployment.buildProgram", effect),
);
