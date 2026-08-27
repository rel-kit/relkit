import { createInterface } from "node:readline/promises";
import {
  createPulumiWorkspace,
  writePulumiProgram,
  type PulumiBackend,
} from "@relkit/deploy-pulumi";
import type { DeploymentPlan } from "@relkit/deploy";
import type { CliCommandContext, CliFailure } from "../main-support.js";
import type { BuildOptions, BuildResult } from "./build.js";
import type { CheckOptions, CheckResult } from "./check.js";

export const DEPLOY_COMMANDS = ["init", "preview", "up", "refresh", "outputs", "destroy"] as const;
export type DeployOperation = (typeof DEPLOY_COMMANDS)[number];

export type ConfigMap = Record<string, { readonly value: string; readonly secret?: boolean }>;

export type DeployContext = Pick<CliCommandContext, "json" | "reporter"> &
  Partial<Pick<CliCommandContext, "signal" | "log">>;
export type WorkspaceHandle = Awaited<ReturnType<typeof createPulumiWorkspace>>;
export type ProgramFiles = Awaited<ReturnType<typeof writePulumiProgram>>;

export interface Prepared {
  readonly root: string;
  readonly plan: DeploymentPlan;
  readonly previousPlan?: DeploymentPlan;
  readonly files: ProgramFiles;
}

export interface DeployCommandOptions {
  readonly projectRoot?: string;
  readonly check?: (options: CheckOptions) => Promise<CheckResult>;
  readonly build?: (options: BuildOptions) => Promise<BuildResult>;
  readonly createWorkspace?: typeof createPulumiWorkspace;
  readonly writeProgram?: typeof writePulumiProgram;
  readonly confirm?: (question: string, signal: AbortSignal) => Promise<boolean>;
}

export interface ParsedDeployArgs {
  readonly command: DeployOperation;
  readonly projectRoot?: string;
  readonly stack: string;
  readonly backend: PulumiBackend;
  readonly config: ConfigMap;
  readonly nonInteractive: boolean;
}

export class DeployCommandError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "DeployCommandError";
    this.code = code;
  }
}

export function parseDeployArgs(args: readonly string[]): ParsedDeployArgs {
  const command = args[0];
  if (!(DEPLOY_COMMANDS as readonly string[]).includes(command ?? ""))
    throw new DeployCommandError(
      "RELKIT_DEPLOY_USAGE",
      "Usage: relkit deploy init|preview|up|refresh|outputs|destroy [options]",
    );
  let projectRoot: string | undefined;
  let stack = "development";
  let backend: PulumiBackend = { kind: "cloud" };
  let nonInteractive = false;
  const config: ConfigMap = {};
  for (let index = 1; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--project-root") projectRoot = required(args, ++index, argument);
    else if (argument === "--stack") stack = required(args, ++index, argument);
    else if (argument === "--backend") backend = parseBackend(required(args, ++index, argument));
    else if (argument === "--config") addConfig(config, required(args, ++index, argument), false);
    else if (argument === "--config-secret")
      addConfig(config, required(args, ++index, argument), true);
    else if (argument === "--non-interactive" || argument === "--yes") nonInteractive = true;
    else throw new DeployCommandError("RELKIT_DEPLOY_USAGE", `Unknown deploy option: ${argument}`);
  }
  if (stack.trim() === "") throw new DeployCommandError("RELKIT_DEPLOY_USAGE", "--stack is empty.");
  return {
    command: command as DeployOperation,
    ...(projectRoot === undefined ? {} : { projectRoot }),
    stack,
    backend,
    config,
    nonInteractive,
  };
}

export function parseBackend(value: string): PulumiBackend {
  if (value === "cloud") return { kind: "cloud" };
  if (value === "local") return { kind: "local" };
  if (/^(s3|azblob|gs):\/\/[^/].*/.test(value)) return { kind: "object-storage", url: value };
  throw new DeployCommandError(
    "RELKIT_DEPLOY_USAGE",
    "--backend must be cloud, local, or an s3://, azblob://, or gs:// URL.",
  );
}

export async function confirmDeployment(question: string, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) throw signal.reason ?? new Error("Deployment was interrupted.");
  if (!process.stdin.isTTY) return false;
  const readline = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = await readline.question(`${question} [y/N] `, { signal });
    if (signal.aborted) throw signal.reason ?? new Error("Deployment was interrupted.");
    return /^(y|yes)$/i.test(answer.trim());
  } finally {
    readline.close();
  }
}

export function safeErrorMessage(error: unknown, redactions: readonly string[] = []): string {
  let message = error instanceof Error ? error.message : String(error);
  for (const value of redactions)
    if (value !== "") message = message.replaceAll(value, "<redacted>");
  return message;
}

function addConfig(config: ConfigMap, value: string, secret: boolean): void {
  const separator = value.indexOf("=");
  if (separator < 1)
    throw new DeployCommandError("RELKIT_DEPLOY_USAGE", "--config requires name=value.");
  const name = value.slice(0, separator);
  config[name] = { value: value.slice(separator + 1), ...(secret ? { secret: true } : {}) };
}

function required(args: readonly string[], index: number, option: string): string {
  const value = args[index];
  if (value === undefined || value.startsWith("-"))
    throw new DeployCommandError("RELKIT_DEPLOY_USAGE", `${option} requires a value.`);
  return value;
}

export function interrupted(signal: AbortSignal): CliFailure {
  const reason = signal.reason as Partial<CliFailure> | undefined;
  const code = reason?.code === "RELKIT_INTERRUPTED" ? reason.code : "RELKIT_INTERRUPTED";
  const exitCode = reason?.exitCode === 143 ? 143 : 130;
  return Object.assign(new Error(reason?.message ?? "Deployment interrupted."), {
    code,
    exitCode,
  }) as CliFailure;
}
