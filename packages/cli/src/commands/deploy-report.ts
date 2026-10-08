import { join } from "node:path";
import { Effect } from "effect";
import { canonicalJson } from "@relkit/contracts";
import {
  createOutputReport,
  serializePulumiReport,
  type PulumiReport,
} from "@relkit/deploy-pulumi";
import { cliTry } from "../cli-errors.js";
import { observeCli, runCliEffect } from "../cli-runtime.js";
import { CliFileSystem, fileSystemLayer } from "../services/filesystem.service.js";
import type {
  DeployExecutionResult,
  ParsedDeployArgs,
  Prepared,
  WorkspaceHandle,
} from "./deploy-support.types.js";

/**
 * Publishes an initialization report through explicit filesystem authority.
 * @param prepared - Accepted plan and program paths.
 * @param handle - Selected SDK workspace.
 * @param parsed - Validated operation/configuration.
 * @returns Lazy secret-free report data and existing human presentation.
 */
export const initializedEffect = Effect.fn("Deployment.initialized")(
  function* (prepared: Prepared, handle: WorkspaceHandle, parsed: ParsedDeployArgs) {
    const reportPath = yield* saveReportEffect(prepared, handle, parsed.command, {
      status: "initialized",
      configNames: Object.keys(parsed.config).sort(),
    });
    return {
      ok: true as const,
      value: base(prepared, handle, parsed.command, reportPath),
      human: `Pulumi stack ${handle.stackName} initialized (${handle.backend.kind}).\nReport: ${reportPath}`,
    };
  },
  (effect, _prepared: Prepared, _handle: WorkspaceHandle, _parsed: ParsedDeployArgs) =>
    observeCli("deployment.initialized", effect),
);

/**
 * Publishes one provider report using the SDK's secret-safe serialization.
 * @param prepared - Accepted deployment cohort.
 * @param handle - Selected SDK workspace.
 * @param command - Explicit operation.
 * @param report - SDK-owned report, already safe for presentation.
 * @param human - Existing human summary.
 * @returns Lazy successful command details after publication.
 */
export const operationResultEffect = Effect.fn("Deployment.operationResult")(
  function* (
    prepared: Prepared,
    handle: WorkspaceHandle,
    command: ParsedDeployArgs["command"],
    report: PulumiReport,
    human: string,
  ) {
    const portable: unknown = yield* cliTry("deployment.serializeReport", () =>
      JSON.parse(serializePulumiReport(report)),
    );
    const reportPath = yield* saveReportEffect(prepared, handle, command, portable);
    return {
      ok: true as const,
      value: { ...base(prepared, handle, command, reportPath), report },
      human: `${human}\nReport: ${reportPath}`,
    };
  },
  (
    effect,
    _prepared: Prepared,
    _handle: WorkspaceHandle,
    _command: ParsedDeployArgs["command"],
    _report: PulumiReport,
    _human: string,
  ) => observeCli("deployment.operationResult", effect),
);

/**
 * Retains the public initialization Promise adapter.
 * @param prepared - Accepted deployment cohort.
 * @param handle - Selected SDK workspace.
 * @param parsed - Validated initialization request.
 * @returns Published successful initialization data.
 */
export function initialized(prepared: Prepared, handle: WorkspaceHandle, parsed: ParsedDeployArgs) {
  return runCliEffect(initializedEffect(prepared, handle, parsed), fileSystemLayer);
}

/**
 * Retains the public provider-report Promise adapter.
 * @param prepared - Accepted deployment cohort.
 * @param handle - Selected SDK workspace.
 * @param command - Selected operation.
 * @param report - SDK report.
 * @param human - Existing summary.
 * @returns Published successful command data.
 */
export function operationResult(
  prepared: Prepared,
  handle: WorkspaceHandle,
  command: ParsedDeployArgs["command"],
  report: PulumiReport,
  human: string,
) {
  return runCliEffect(
    operationResultEffect(prepared, handle, command, report, human),
    fileSystemLayer,
  );
}

/**
 * Projects a declined mutation without publishing a success report.
 * @param prepared - Accepted deployment cohort.
 * @param handle - Selected stack/workspace metadata.
 * @param parsed - Declined operation.
 * @param human - Existing decline wording.
 * @returns Portable decline status and unchanged human presentation.
 */
export function declined(
  prepared: Prepared,
  handle: WorkspaceHandle,
  parsed: ParsedDeployArgs,
  human: string,
): { readonly ok: false; readonly value: Record<string, unknown>; readonly human: string } {
  return {
    ok: false,
    value: { ...base(prepared, handle, parsed.command), ok: false, status: "declined" },
    human,
  };
}

/** Reads one preview operation count using the existing absent-count default.
 * @param summary - Native preview counts.
 * @param name - Resource change kind.
 * @returns Zero for an absent count.
 */
export function changeCount(
  summary: Readonly<Record<string, number | undefined>>,
  name: string,
): number {
  return summary[name] ?? 0;
}

/** Renders the final stack consent prompt from declared risk counts.
 * @param stack - Selected public stack name.
 * @param destructive - Destructive count.
 * @param security - Security-sensitive count.
 * @returns The existing consent question.
 */
export function confirmationQuestion(stack: string, destructive: number, security: number): string {
  return `Pulumi changes for ${stack}: ${destructive} destructive, ${security} security-sensitive. Continue?`;
}

/** Lists deployment output names without exposing their values.
 * @param report - SDK secret-safe output report.
 * @returns Sorted output names without exposing values.
 */
export function formatOutputs(report: ReturnType<typeof createOutputReport>): string {
  const names = Object.keys(report.outputs).sort();
  return names.length === 0
    ? "Pulumi outputs: none."
    : `Pulumi outputs:\n${names.map((name) => `  ${name}`).join("\n")}`;
}

/**
 * Owns report file publication without recording credentials in observer attributes.
 * @param prepared - Accepted plan/program location.
 * @param handle - Selected native workspace.
 * @param command - Bounded operation label.
 * @param report - Secret-safe serialized report.
 * @returns The published report path.
 */
const saveReportEffect = Effect.fn("Deployment.saveReport")(
  function* (
    prepared: Prepared,
    handle: WorkspaceHandle,
    command: ParsedDeployArgs["command"],
    report: unknown,
  ) {
    const files = yield* CliFileSystem;
    const path = join(prepared.files.directory, `${command}.report.json`);
    const text = yield* cliTry(
      "deployment.reportJson",
      () =>
        `${canonicalJson({
          protocol: "relkit.deployment-report",
          version: 1,
          command,
          stack: handle.stackName,
          backend: handle.backend,
          graphHash: prepared.plan.graphHash,
          report,
        })}\n`,
    );
    yield* files.mkdir(prepared.files.directory);
    yield* files.writeText(path, text);
    return path;
  },
  (
    effect,
    _prepared: Prepared,
    _handle: WorkspaceHandle,
    _command: ParsedDeployArgs["command"],
    _report: unknown,
  ) => observeCli("deployment.saveReport", effect),
);

/**
 * Projects the common public deployment metadata without private configuration.
 * @param prepared - Accepted plan and program paths.
 * @param handle - Selected workspace/backend metadata.
 * @param command - Public operation.
 * @param reportPath - Optional published report.
 * @returns The existing portable result envelope.
 */
function base(
  prepared: Prepared,
  handle: WorkspaceHandle,
  command: ParsedDeployArgs["command"],
  reportPath?: string,
): Record<string, unknown> {
  return {
    ok: true,
    command,
    projectRoot: prepared.root,
    projectName: handle.projectName,
    stack: handle.stackName,
    backend: handle.backend,
    graphHash: prepared.plan.graphHash,
    planPath: join(prepared.files.directory, "plan.json"),
    ...(reportPath === undefined ? {} : { reportPath }),
  };
}
