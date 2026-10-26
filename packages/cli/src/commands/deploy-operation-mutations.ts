/** Executes selected native operations without retaining a global SDK implementation. */
import { Effect, Ref } from "effect";
import { diffDeploymentPlans } from "@relkit/deploy";
import { cliTry } from "../cli-errors.js";
import { CliPulumi } from "../services/pulumi.service.js";
import { CliDeployConfirmation } from "../services/deploy-confirmation.service.js";
import type {
  Prepared,
  WorkspaceHandle,
  ParsedDeployArgs,
  PulumiEvent,
} from "./deploy-support.types.js";
import type { DeploymentOperationResult, DeploymentOperation } from "./deploy-operation.types.js";
import {
  operationResultEffect,
  declined,
  confirmationQuestion,
  changeCount,
} from "./deploy-report.js";

/** Executes one explicit operation; mutations are neither cached nor retried. */
export const applyDeployment: DeploymentOperation = Effect.fn("Deployment.applyDeployment")(
  function* (
    prepared: Prepared,
    handle: WorkspaceHandle,
    parsed: ParsedDeployArgs,
    events: Ref.Ref<readonly PulumiEvent[]>,
    onEvent: (event: PulumiEvent) => void,
  ): DeploymentOperationResult {
    const sdk = yield* CliPulumi;
    const { createUpdateReport, formatPulumiSummary } = prepared.engine;
    const consent = yield* CliDeployConfirmation;
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
  },
);

/** Executes one explicit operation; mutations are neither cached nor retried. */
export const destroyDeployment: DeploymentOperation = Effect.fn("Deployment.destroyDeployment")(
  function* (
    prepared: Prepared,
    handle: WorkspaceHandle,
    parsed: ParsedDeployArgs,
    events: Ref.Ref<readonly PulumiEvent[]>,
    onEvent: (event: PulumiEvent) => void,
  ): DeploymentOperationResult {
    const sdk = yield* CliPulumi;
    const { createPreviewReport, formatPulumiSummary } = prepared.engine;
    const consent = yield* CliDeployConfirmation;
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
);

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
