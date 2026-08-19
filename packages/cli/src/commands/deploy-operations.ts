import { diffDeploymentPlans } from "@zsys/deploy";
import {
  createOutputReport,
  createPreviewReport,
  createUpdateReport,
  formatPulumiSummary,
  toPulumiLog,
} from "@zsys/deploy-pulumi";
import {
  confirmDeployment,
  type DeployCommandOptions,
  type DeployContext,
  type ParsedDeployArgs,
  type Prepared,
  type WorkspaceHandle,
} from "./deploy-support.js";
import {
  changeCount,
  confirmationQuestion,
  declined,
  formatOutputs,
  initialized,
  operationResult,
} from "./deploy-report.js";

type PulumiStack = WorkspaceHandle["stack"];
type PulumiPreviewOptions = NonNullable<Parameters<PulumiStack["preview"]>[0]>;
type PulumiEvent = Parameters<NonNullable<PulumiPreviewOptions["onEvent"]>>[0];

export async function execute(
  prepared: Prepared,
  handle: WorkspaceHandle,
  parsed: ParsedDeployArgs,
  signal: AbortSignal,
  context: DeployContext,
  options: DeployCommandOptions,
): Promise<{
  readonly ok: boolean;
  readonly value: Record<string, unknown>;
  readonly human: string;
}> {
  if (signal.aborted) throw signal.reason ?? new Error("Deployment interrupted.");
  if (parsed.command === "init") return initialized(prepared, handle, parsed);
  const events: PulumiEvent[] = [];
  const onEvent = (event: PulumiEvent): void => {
    events.push(event);
    const log = toPulumiLog(event);
    if (log !== undefined) context.log?.(log.level, log.message, log.fields);
  };
  if (parsed.command === "preview") {
    const result = await handle.stack.preview({ refresh: false, signal, onEvent });
    const report = createPreviewReport(result, events);
    return operationResult(
      prepared,
      handle,
      parsed.command,
      report,
      formatPulumiSummary(report.summary),
    );
  }
  if (parsed.command === "up") {
    const preview = await handle.stack.preview({ refresh: false, signal, onEvent });
    const security = prepared.previousPlan
      ? diffDeploymentPlans(prepared.previousPlan, prepared.plan).summary.securitySensitive
      : 0;
    const destructive =
      changeCount(preview.changeSummary, "delete") +
      changeCount(preview.changeSummary, "replace") +
      changeCount(preview.changeSummary, "create-replacement") +
      changeCount(preview.changeSummary, "delete-replaced");
    if (destructive > 0 || security > 0) {
      const confirmed =
        parsed.nonInteractive ||
        (await (options.confirm ?? confirmDeployment)(
          confirmationQuestion(parsed.stack, destructive, security),
          signal,
        ));
      if (!confirmed)
        return declined(
          prepared,
          handle,
          parsed,
          "Deployment declined; use --non-interactive in CI.",
        );
    }
    const result = await handle.stack.up({ refresh: false, signal, onEvent });
    const report = createUpdateReport(result, events);
    return operationResult(
      prepared,
      handle,
      parsed.command,
      report,
      formatPulumiSummary(report.summary, "up"),
    );
  }
  if (parsed.command === "outputs") {
    const report = createOutputReport(await handle.stack.outputs());
    if (signal.aborted) throw signal.reason ?? new Error("Deployment interrupted.");
    return operationResult(prepared, handle, parsed.command, report, formatOutputs(report));
  }
  if (parsed.command === "refresh") {
    const result = await handle.stack.refresh({ runProgram: true, signal, onEvent });
    const report = createPreviewReport(
      { changeSummary: result.summary.resourceChanges ?? {} },
      events,
    );
    return operationResult(
      prepared,
      handle,
      parsed.command,
      report,
      formatPulumiSummary(report.summary, "refresh"),
    );
  }
  const preview = await handle.stack.previewDestroy({ signal, onEvent });
  const destructive =
    changeCount(preview.changeSummary, "delete") +
    changeCount(preview.changeSummary, "replace") +
    changeCount(preview.changeSummary, "create-replacement") +
    changeCount(preview.changeSummary, "delete-replaced");
  if (
    destructive > 0 &&
    !parsed.nonInteractive &&
    !(await (options.confirm ?? confirmDeployment)(
      confirmationQuestion(parsed.stack, destructive, 0),
      signal,
    ))
  )
    return declined(prepared, handle, parsed, "Destroy declined; no resources were removed.");
  const result = await handle.stack.destroy({ signal, onEvent });
  const report = createPreviewReport(
    { changeSummary: result.summary.resourceChanges ?? {} },
    events,
  );
  return operationResult(
    prepared,
    handle,
    parsed.command,
    report,
    formatPulumiSummary(report.summary, "destroy"),
  );
}
