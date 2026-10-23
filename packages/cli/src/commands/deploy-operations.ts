/** Dispatches deployment operations through their selected engine authority. */
import { Effect, Layer, MutableRef, Ref } from "effect";
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
import { initializedEffect } from "./deploy-report.js";
import {
  previewDeployment,
  deploymentOutputs,
  refreshDeployment,
} from "./deploy-operation-actions.js";
import { applyDeployment, destroyDeployment } from "./deploy-operation-mutations.js";

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
    if (parsed.command === "init") return yield* initializedEffect(prepared, handle, parsed);
    const events = yield* Ref.make<readonly PulumiEvent[]>([]);
    const onEvent = (event: PulumiEvent): void => {
      MutableRef.update(events.ref, (prior) => [...prior, event]);
      const log = prepared.engine.toPulumiLog(event);
      if (log !== undefined) context.log?.(log.level, log.message, log.fields);
    };
    const action =
      parsed.command === "preview"
        ? previewDeployment
        : parsed.command === "up"
          ? applyDeployment
          : parsed.command === "outputs"
            ? deploymentOutputs
            : parsed.command === "refresh"
              ? refreshDeployment
              : destroyDeployment;
    return yield* action(prepared, handle, parsed, events, onEvent);
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
