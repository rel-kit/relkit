import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { canonicalJson } from "@relkit/contracts";
import {
  createOutputReport,
  serializePulumiReport,
  type PulumiReport,
} from "@relkit/deploy-pulumi";
import type { ParsedDeployArgs, Prepared, WorkspaceHandle } from "./deploy-support.js";

export function initialized(
  prepared: Prepared,
  handle: WorkspaceHandle,
  parsed: ParsedDeployArgs,
): Promise<{ readonly ok: true; readonly value: Record<string, unknown>; readonly human: string }> {
  return saveReport(prepared, handle, parsed.command, {
    status: "initialized",
    configNames: Object.keys(parsed.config).sort(),
  }).then((reportPath) => ({
    ok: true,
    value: base(prepared, handle, parsed.command, reportPath),
    human: `Pulumi stack ${handle.stackName} initialized (${handle.backend.kind}).\nReport: ${reportPath}`,
  }));
}

export async function operationResult(
  prepared: Prepared,
  handle: WorkspaceHandle,
  command: ParsedDeployArgs["command"],
  report: PulumiReport,
  human: string,
): Promise<{ readonly ok: true; readonly value: Record<string, unknown>; readonly human: string }> {
  const reportPath = await saveReport(
    prepared,
    handle,
    command,
    JSON.parse(serializePulumiReport(report)),
  );
  return {
    ok: true,
    value: { ...base(prepared, handle, command, reportPath), report },
    human: `${human}\nReport: ${reportPath}`,
  };
}

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

export function changeCount(
  summary: Readonly<Record<string, number | undefined>>,
  name: string,
): number {
  return summary[name] ?? 0;
}

export function confirmationQuestion(stack: string, destructive: number, security: number): string {
  return `Pulumi changes for ${stack}: ${destructive} destructive, ${security} security-sensitive. Continue?`;
}

export function formatOutputs(report: ReturnType<typeof createOutputReport>): string {
  const names = Object.keys(report.outputs).sort();
  return names.length === 0
    ? "Pulumi outputs: none."
    : `Pulumi outputs:\n${names.map((name) => `  ${name}`).join("\n")}`;
}

async function saveReport(
  prepared: Prepared,
  handle: WorkspaceHandle,
  command: ParsedDeployArgs["command"],
  report: unknown,
): Promise<string> {
  const path = join(prepared.files.directory, `${command}.report.json`);
  await mkdir(prepared.files.directory, { recursive: true });
  await writeFile(
    path,
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
  return path;
}

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
