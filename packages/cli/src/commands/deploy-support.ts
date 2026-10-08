import { Schema } from "effect";
import type { PulumiBackend } from "@relkit/deploy-pulumi";
import { CliFailureError } from "../cli-errors.js";
import { DEPLOY_COMMANDS, deployOperationSchema } from "./deploy.schemas.js";
import type { ConfigMap, ParsedDeployArgs } from "./deploy-support.types.js";
export { DEPLOY_COMMANDS } from "./deploy.schemas.js";
export { confirmDeployment, confirmDeploymentEffect } from "./deploy-confirmation.js";
export type {
  ConfigMap,
  DeployCommandOptions,
  DeployContext,
  DeployOperation,
  ParsedDeployArgs,
  Prepared,
  ProgramFiles,
  WorkspaceHandle,
} from "./deploy-support.types.js";

/** An expected deployment usage or cohort failure with its original public code. */
export class DeployCommandError extends Schema.TaggedError<DeployCommandError>()(
  "DeployCommandError",
  {
    code: Schema.String,
    message: Schema.String,
  },
) {
  /**
   * Creates the existing public positional error contract.
   * @param code - Stable deployment failure code.
   * @param message - Public, redacted-at-presentation message.
   */
  constructor(code: string, message: string) {
    super({ code, message });
    this.name = "DeployCommandError";
  }
}

/**
 * Validates operation/options before acquiring any SDK capability.
 * @param args - Arguments after the deploy command.
 * @returns Validated deployment configuration with existing defaults.
 * @throws DeployCommandError for usage errors.
 */
export function parseDeployArgs(args: readonly string[]): ParsedDeployArgs {
  const command = args[0];
  if (!Schema.is(deployOperationSchema)(command))
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
    command,
    ...(projectRoot === undefined ? {} : { projectRoot }),
    stack,
    backend,
    config,
    nonInteractive,
  };
}

/**
 * Parses the explicitly selected persistence backend.
 * @param value - CLI backend spelling or object-storage URL.
 * @returns The supported Pulumi backend without creating any state.
 */
export function parseBackend(value: string): PulumiBackend {
  if (value === "cloud") return { kind: "cloud" };
  if (value === "local") return { kind: "local" };
  if (/^(s3|azblob|gs):\/\/[^/].*/.test(value)) return { kind: "object-storage", url: value };
  throw new DeployCommandError(
    "RELKIT_DEPLOY_USAGE",
    "--backend must be cloud, local, or an s3://, azblob://, or gs:// URL.",
  );
}

/**
 * Redacts configured values from public expected-error presentation.
 * @param error - Original native or domain failure.
 * @param redactions - Values owned by this invocation.
 * @returns A message containing no configured secret values.
 */
export function safeErrorMessage(error: unknown, redactions: readonly string[] = []): string {
  let message = error instanceof Error ? error.message : String(error);
  for (const value of redactions)
    if (value !== "") message = message.replaceAll(value, "<redacted>");
  return message;
}

/** Validates and records one Pulumi configuration option with its secrecy policy.
 * @param config - Invocation-owned option map.
 * @param value - Original name=value token.
 * @param secret - Whether Pulumi must encrypt it.
 * @returns No value after validating and inserting the option.
 */
function addConfig(config: ConfigMap, value: string, secret: boolean): void {
  const separator = value.indexOf("=");
  if (separator < 1)
    throw new DeployCommandError("RELKIT_DEPLOY_USAGE", "--config requires name=value.");
  const name = value.slice(0, separator);
  config[name] = { value: value.slice(separator + 1), ...(secret ? { secret: true } : {}) };
}

/** Validates the required value following a deployment option.
 * @param args - Original option tokens.
 * @param index - Required value position.
 * @param option - Diagnostic label.
 * @returns The accepted non-option token.
 */
function required(args: readonly string[], index: number, option: string): string {
  const value = args[index];
  if (value === undefined || value.startsWith("-"))
    throw new DeployCommandError("RELKIT_DEPLOY_USAGE", `${option} requires a value.`);
  return value;
}

/**
 * Retains signal-specific exit behavior without asserting an arbitrary abort reason.
 * @param signal - Caller signal that interrupted deployment.
 * @returns The established typed interruption failure.
 */
export function interrupted(signal: AbortSignal): CliFailureError {
  const reason: unknown = signal.reason;
  const exitCode =
    typeof reason === "object" && reason !== null && "exitCode" in reason && reason.exitCode === 143
      ? 143
      : 130;
  const message = reason instanceof Error ? reason.message : "Deployment interrupted.";
  return new CliFailureError({ code: "RELKIT_INTERRUPTED", exitCode, message });
}
