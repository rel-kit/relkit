/** Executes selected native operations without retaining a global SDK implementation. */
import { Effect, Ref } from "effect";
import { cliTry } from "../cli-errors.js";
import { CliPulumi } from "../services/pulumi.service.js";
import type {
  Prepared,
  WorkspaceHandle,
  ParsedDeployArgs,
  PulumiEvent,
} from "./deploy-support.types.js";
import type { DeploymentOperationResult, DeploymentOperation } from "./deploy-operation.types.js";
import { operationResultEffect, formatOutputs } from "./deploy-report.js";

/** Executes one explicit operation; mutations are neither cached nor retried. */
export const previewDeployment: DeploymentOperation = Effect.fn("Deployment.previewDeployment")(
  function* (
    prepared: Prepared,
    handle: WorkspaceHandle,
    parsed: ParsedDeployArgs,
    events: Ref.Ref<readonly PulumiEvent[]>,
    onEvent: (event: PulumiEvent) => void,
  ): DeploymentOperationResult {
    const sdk = yield* CliPulumi;
    const { createPreviewReport, formatPulumiSummary } = prepared.engine;
    const result = yield* sdk.preview(handle.stack, { refresh: false, onEvent });
    const report = yield* cliTry("deployment.previewReport", () =>
      createPreviewReport(result, Ref.getUnsafe(events)),
    );
    return yield* operationResultEffect(
      prepared,
      handle,
      parsed.command,
      report,
      formatPulumiSummary(report.summary),
    );
  },
);

/** Executes one explicit operation; mutations are neither cached nor retried. */
export const deploymentOutputs: DeploymentOperation = Effect.fn("Deployment.deploymentOutputs")(
  function* (
    prepared: Prepared,
    handle: WorkspaceHandle,
    parsed: ParsedDeployArgs,
    events: Ref.Ref<readonly PulumiEvent[]>,
    onEvent: (event: PulumiEvent) => void,
  ): DeploymentOperationResult {
    const sdk = yield* CliPulumi;
    const { createOutputReport } = prepared.engine;
    const outputs = yield* sdk.outputs(handle.stack);
    yield* Effect.yieldNow;
    const report = yield* cliTry("deployment.outputReport", () => createOutputReport(outputs));
    return yield* operationResultEffect(
      prepared,
      handle,
      parsed.command,
      report,
      formatOutputs(report),
    );
  },
);

/** Executes one explicit operation; mutations are neither cached nor retried. */
export const refreshDeployment: DeploymentOperation = Effect.fn("Deployment.refreshDeployment")(
  function* (
    prepared: Prepared,
    handle: WorkspaceHandle,
    parsed: ParsedDeployArgs,
    events: Ref.Ref<readonly PulumiEvent[]>,
    onEvent: (event: PulumiEvent) => void,
  ): DeploymentOperationResult {
    const sdk = yield* CliPulumi;
    const { createPreviewReport, formatPulumiSummary } = prepared.engine;
    const result = yield* sdk.refresh(handle.stack, { runProgram: true, onEvent });
    const report = yield* cliTry("deployment.refreshReport", () =>
      createPreviewReport(
        { changeSummary: result.summary.resourceChanges ?? {} },
        Ref.getUnsafe(events),
      ),
    );
    return yield* operationResultEffect(
      prepared,
      handle,
      parsed.command,
      report,
      formatPulumiSummary(report.summary, "refresh"),
    );
  },
);
