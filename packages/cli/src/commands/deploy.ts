import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fromGraph } from "@zsys/deploy";
import {
  createPulumiProgram,
  createPulumiWorkspace,
  writePulumiProgram,
} from "@zsys/deploy-pulumi";
import type { ApplicationGraph } from "@zsys/graph";
import { CLI_EXIT_CODES } from "../main-support.js";
import { buildProject, type BuildOptions, type BuildResult } from "./build.js";
import { checkProject, type CheckOptions, type CheckResult } from "./check.js";
import { execute } from "./deploy-operations.js";
import {
  DeployCommandError,
  interrupted,
  parseDeployArgs,
  safeErrorMessage,
  type DeployCommandOptions,
  type DeployContext,
  type ParsedDeployArgs,
  type Prepared,
  type WorkspaceHandle,
} from "./deploy-support.js";

/** Runs all deployment lifecycle operations through the Pulumi Automation API. */
export async function runDeploy(
  args: readonly string[],
  context: DeployContext,
  options: DeployCommandOptions = {},
): Promise<number> {
  let parsed: ParsedDeployArgs | undefined;
  let redactions: string[] = [];
  try {
    parsed = parseDeployArgs(args);
    redactions = Object.values(parsed.config).map((entry) => entry.value);
    const signal = context.signal ?? new AbortController().signal;
    const root = resolve(parsed.projectRoot ?? options.projectRoot ?? process.cwd());
    const prepared = await prepare(root, parsed, signal, options);
    const handle = await openWorkspace(prepared, parsed, options);
    const result = await execute(prepared, handle, parsed, signal, context, options);
    context.reporter.output(result.value, result.human);
    return result.ok ? CLI_EXIT_CODES.success : CLI_EXIT_CODES.failure;
  } catch (error) {
    if (context.signal?.aborted) {
      const failure = interrupted(context.signal);
      context.reporter.error(failure.code, failure.message);
      return failure.exitCode;
    }
    const code = commandCode(error);
    context.reporter.error(code, safeErrorMessage(error, redactions));
    return code === "ZSYS_DEPLOY_USAGE" ? CLI_EXIT_CODES.usage : CLI_EXIT_CODES.failure;
  }
}

export { DeployCommandError, parseDeployArgs } from "./deploy-support.js";
export type {
  DeployCommandOptions,
  DeployContext,
  DeployOperation,
  ParsedDeployArgs,
} from "./deploy-support.js";

async function prepare(
  root: string,
  parsed: ParsedDeployArgs,
  signal: AbortSignal,
  options: DeployCommandOptions,
): Promise<Prepared> {
  throwIfAborted(signal);
  const checked = await (options.check ?? checkProject)({ projectRoot: root, signal });
  throwIfAborted(signal);
  if (!checked.ok || checked.graphHash === undefined)
    throw new DeployCommandError("ZSYS_DEPLOY_CHECK_FAILED", checkFailure(checked));
  let graph: ApplicationGraph;
  try {
    graph = JSON.parse(checked.outputs.graph) as ApplicationGraph;
  } catch {
    throw new DeployCommandError("ZSYS_DEPLOY_GRAPH_INVALID", "The checked graph is invalid JSON.");
  }
  const plan = fromGraph(graph);
  if (plan.graphHash !== checked.graphHash)
    throw new DeployCommandError(
      "ZSYS_DEPLOY_CHECK_FAILED",
      "The checked graph changed before planning.",
    );
  if (parsed.command === "preview" || parsed.command === "up") {
    const built = await (options.build ?? buildProject)({
      projectRoot: root,
      signal,
      check: async () => checked,
    });
    throwIfAborted(signal);
    if (!built.ok) throw new DeployCommandError("ZSYS_DEPLOY_BUILD_FAILED", checkFailure(built));
  }
  const directory = resolve(root, ".zsys/generated/pulumi");
  const previousPlan = await readPlan(join(directory, "plan.json"));
  const files = await (options.writeProgram ?? writePulumiProgram)(plan, {
    projectRoot: root,
    projectName: plan.application.id,
    stackName: parsed.stack,
  });
  return { root, plan, ...(previousPlan === undefined ? {} : { previousPlan }), files };
}

async function openWorkspace(
  prepared: Prepared,
  parsed: ParsedDeployArgs,
  options: DeployCommandOptions,
): Promise<WorkspaceHandle> {
  const program = createPulumiProgram(prepared.plan, {
    projectName: prepared.plan.application.id,
    stackName: parsed.stack,
    projectRoot: prepared.root,
    directory: ".zsys/generated/pulumi",
  });
  const config = Object.keys(parsed.config).length === 0 ? {} : { config: parsed.config };
  return (options.createWorkspace ?? createPulumiWorkspace)({
    projectName: prepared.plan.application.id,
    stackName: parsed.stack,
    workDir: prepared.files.directory,
    backend: parsed.backend,
    mode: parsed.command === "init" ? "create-or-select" : "select",
    program,
    ...config,
  });
}

async function readPlan(path: string): Promise<Prepared["plan"] | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as Prepared["plan"];
  } catch {
    return undefined;
  }
}

function checkFailure(result: CheckResult | BuildResult): string {
  const codes = result.diagnostics.map((diagnostic) => diagnostic.code).filter(Boolean);
  return codes.length === 0
    ? "The project check did not succeed."
    : `Project check failed: ${codes.join(", ")}.`;
}

function commandCode(error: unknown): string {
  return error instanceof DeployCommandError
    ? error.code
    : typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof error.code === "string"
      ? error.code
      : "ZSYS_DEPLOY_FAILED";
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw signal.reason ?? new Error("Deployment interrupted.");
}
