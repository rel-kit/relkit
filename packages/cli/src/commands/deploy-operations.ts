import { Effect, Layer, MutableRef, Ref } from "effect";
import { diffDeploymentPlans } from "@relkit/deploy";
import {
  createOutputReport,
  createPreviewReport,
  createUpdateReport,
  formatPulumiSummary,
  toPulumiLog,
} from "@relkit/deploy-pulumi";
import { cliTry } from "../cli-errors.js";
import { observeCli, runCliEffect } from "../cli-runtime.js";
import { fileSystemLayer } from "../services/filesystem.service.js";
import { CliPulumi, pulumiLayer } from "../services/pulumi.service.js";
import {
  CliDeployConfirmation,
  deployConfirmationLayer,
} from "../services/deploy-confirmation.service.js";
import type {
  DeployCommandOptions,
  DeployContext,
  DeployExecutionResult,
  ParsedDeployArgs,
  Prepared,
  PulumiEvent,
  WorkspaceHandle,
} from "./deploy-support.types.js";
import {
  changeCount,
  confirmationQuestion,
  declined,
  formatOutputs,
  initializedEffect,
  operationResultEffect,
} from "./deploy-report.js";

/**
 * Executes one selected operation with separately supplied SDK and consent authority.
 * @param prepared - Validated cohort and generated program.
 * @param handle - Explicitly selected SDK workspace.
 * @param parsed - Validated operation and non-interactive policy.
 * @param context - Existing optional event sink; event payloads are never operation labels.
 * @returns One portable result after report publication; mutations are never retried.
 */
export const executeDeployEffect = Effect.fn("Deployment.execute")(
  function* (
    prepared: Prepared,
    handle: WorkspaceHandle,
    parsed: ParsedDeployArgs,
    context: DeployContext,
  ): Effect.fn.Return<
    DeployExecutionResult,
    import("../cli-errors.js").CliAdapterError,
    CliPulumi | CliDeployConfirmation | import("../services/filesystem.service.js").CliFileSystem
  > {
    const sdk = yield* CliPulumi;
    const consent = yield* CliDeployConfirmation;
    if (parsed.command === "init") return yield* initializedEffect(prepared, handle, parsed);
    const events = yield* Ref.make<readonly PulumiEvent[]>([]);
    // Pulumi invokes this synchronous native callback; only this operation's Ref is updated.
    const onEvent = (event: PulumiEvent): void => {
      MutableRef.update(events.ref, (prior) => [...prior, event]);
      const log = toPulumiLog(event);
      if (log !== undefined) context.log?.(log.level, log.message, log.fields);
    };
    if (parsed.command === "preview") {
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
    }
    if (parsed.command === "up") {
      const preview = yield* sdk.preview(handle.stack, { refresh: false, onEvent });
      const security = yield* cliTry("deployment.planDiff", () =>
        prepared.previousPlan
          ? diffDeploymentPlans(prepared.previousPlan, prepared.plan).summary.securitySensitive
          : 0,
      );
      const destructive = destructiveCount(preview.changeSummary);
      if ((destructive > 0 || security > 0) && !parsed.nonInteractive) {
        const confirmed = yield* consent.confirm(
          confirmationQuestion(parsed.stack, destructive, security),
        );
        if (!confirmed)
          return declined(
            prepared,
            handle,
            parsed,
            "Deployment declined; use --non-interactive in CI.",
          );
      }
      const result = yield* sdk.up(handle.stack, { refresh: false, onEvent });
      const report = yield* cliTry("deployment.updateReport", () =>
        createUpdateReport(result, Ref.getUnsafe(events)),
      );
      return yield* operationResultEffect(
        prepared,
        handle,
        parsed.command,
        report,
        formatPulumiSummary(report.summary, "up"),
      );
    }
    if (parsed.command === "outputs") {
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
    }
    if (parsed.command === "refresh") {
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
    }
    const preview = yield* sdk.previewDestroy(handle.stack, { onEvent });
    const destructive = destructiveCount(preview.changeSummary);
    if (
      destructive > 0 &&
      !parsed.nonInteractive &&
      !(yield* consent.confirm(confirmationQuestion(parsed.stack, destructive, 0)))
    )
      return declined(prepared, handle, parsed, "Destroy declined; no resources were removed.");
    const result = yield* sdk.destroy(handle.stack, { onEvent });
    const report = yield* cliTry("deployment.destroyReport", () =>
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
      formatPulumiSummary(report.summary, "destroy"),
    );
  },
  (
    effect,
    _prepared: Prepared,
    _handle: WorkspaceHandle,
    _parsed: ParsedDeployArgs,
    _context: DeployContext,
  ) => observeCli("deployment.execute", effect),
);

/**
 * Adapts standalone execution to one scoped runtime.
 * @param prepared - Accepted deployment cohort.
 * @param handle - Selected SDK workspace.
 * @param parsed - Validated request.
 * @param signal - Optional cancellation carried by the legacy public contract.
 * @param context - Existing presentation/event policy.
 * @param options - Public compatibility SDK/confirmation substitutes.
 * @returns One command result after native settlement and report writes.
 */
export function execute(
  prepared: Prepared,
  handle: WorkspaceHandle,
  parsed: ParsedDeployArgs,
  signal: AbortSignal,
  context: DeployContext,
  options: DeployCommandOptions,
) {
  return runCliEffect(
    executeDeployEffect(prepared, handle, parsed, context),
    Layer.mergeAll(fileSystemLayer, pulumiLayer(options), deployConfirmationLayer(options)),
    signal,
  );
}

/** Counts preview operations requiring destructive-change consent.
 * @param summary - Native preview counts.
 * @returns Combined destructive replacement/delete operations for consent.
 */
function destructiveCount(summary: Readonly<Record<string, number | undefined>>): number {
  return ["delete", "replace", "create-replacement", "delete-replaced"].reduce(
    (count, name) => count + changeCount(summary, name),
    0,
  );
}
