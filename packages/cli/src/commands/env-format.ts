import { canonicalJson } from "@relkit/contracts";
import type { EnvMetadata, EnvProjection, EnvValueType } from "@relkit/config";
import type {
  EnvStatus,
  ParsedEnvArgs,
  EnvCheckPresentation,
  EnvExplainPresentation,
} from "./env.types.js";
export type { EnvStatus, ParsedEnvArgs, EnvCommandOptions, SafeEnvIssue } from "./env.types.js";

/** Established environment exception with unchanged public code and constructor. */
export class EnvCommandError extends Error {
  readonly code: string;

  /**
   * Constructs the existing environment command failure.
   * @param code - Public diagnostic code.
   * @param message - Existing safe failure text.
   */
  constructor(code: string, message: string) {
    super(message);
    this.name = "EnvCommandError";
    this.code = code;
  }
}

/**
 * Parses environment flags without reading source values.
 * @param args - Subcommand and literal flags.
 * @returns Parsed selection with optional overrides retained.
 * @throws EnvCommandError for usage failures.
 */
export function parseEnvArgs(args: readonly string[]): ParsedEnvArgs {
  const command = args[0];
  if (command !== "check" && command !== "example" && command !== "explain" && command !== "list")
    throw new EnvCommandError(
      "RELKIT_ENV_USAGE",
      "Usage: relkit env check|example|explain <NAME>|list [options]",
    );
  let name: string | undefined;
  let environment: string | undefined;
  let projectRoot: string | undefined;
  let examplePath: string | undefined;
  let write = false;
  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--write") write = true;
    else if (arg === "--environment" || arg === "--env")
      environment = requiredValue(args, ++index, arg);
    else if (arg === "--project-root") projectRoot = requiredValue(args, ++index, arg);
    else if (arg === "--path" || arg === "--file") examplePath = requiredValue(args, ++index, arg);
    else if (arg.startsWith("-"))
      throw new EnvCommandError("RELKIT_ENV_USAGE", `Unknown env option: ${arg}`);
    else if (name === undefined) name = arg;
    else
      throw new EnvCommandError(
        "RELKIT_ENV_USAGE",
        "Only one environment variable name is allowed.",
      );
  }
  if (command === "explain" && name === undefined)
    throw new EnvCommandError("RELKIT_ENV_USAGE", "env explain requires a variable name.");
  if (command !== "example" && write)
    throw new EnvCommandError("RELKIT_ENV_USAGE", "--write is only valid for env example.");
  if (command !== "example" && examplePath !== undefined)
    throw new EnvCommandError("RELKIT_ENV_USAGE", "--path is only valid for env example.");
  return {
    command,
    ...(name === undefined ? {} : { name }),
    ...(environment === undefined ? {} : { environment }),
    ...(projectRoot === undefined ? {} : { projectRoot }),
    ...(examplePath === undefined ? {} : { examplePath }),
    write,
  };
}

/**
 * Formats a safe example, redacting sensitive fields before considering values.
 * @param field - Value-free projected field metadata.
 * @returns A literal or safe placeholder for an example file.
 */
export function exampleValue(field: EnvProjection): string {
  if (field.sensitive) return "[redacted]";
  if (field.example !== undefined) return envValue(field.example);
  if (field.type === "literal" && field.values?.[0] !== undefined) return envValue(field.values[0]);
  const placeholders: Record<EnvValueType, string> = {
    string: "example",
    number: "0",
    boolean: "false",
    port: "3000",
    literal: "",
    url: "https://example.invalid",
    json: "{}",
    "secret-string": "[redacted]",
  };
  return placeholders[field.type];
}

/**
 * Quotes one public example value for dotenv syntax.
 * @param value - Authored public example.
 * @returns Stable quoted or canonical JSON text.
 */
function envValue(value: unknown): string {
  if (typeof value === "string") return /[\s#"'\\\r\n]/.test(value) ? JSON.stringify(value) : value;
  return canonicalJson(value);
}

/**
 * Reads an explicit value following an environment flag.
 * @param args - Original arguments.
 * @param index - Value position.
 * @param option - Flag used in failure text.
 * @returns Literal option value.
 * @throws EnvCommandError when missing.
 */
function requiredValue(args: readonly string[], index: number, option: string): string {
  const value = args[index];
  if (value === undefined || value.startsWith("-"))
    throw new EnvCommandError("RELKIT_ENV_USAGE", `${option} requires a value.`);
  return value;
}

/**
 * Determines requirement status without evaluating defaults or source values.
 * @param field - Declaration requirement metadata.
 * @param environment - Selected environment name.
 * @returns Whether the field is required in that environment.
 */
export function isRequired(
  field: Pick<EnvMetadata, "requiredIn" | "optional">,
  environment: string,
): boolean {
  return field.requiredIn.length > 0 ? field.requiredIn.includes(environment) : !field.optional;
}

/**
 * Formats the existing secret-free check report.
 * @param result - Safe statuses and environment name.
 * @returns Stable human output.
 */
export function formatCheck(result: EnvCheckPresentation): string {
  return [
    `Environment: ${result.environment}`,
    ...result.items.map((item) => `${item.name}: ${item.status}`),
    result.ok ? "Environment is valid." : "Environment is invalid.",
  ].join("\n");
}

/**
 * Formats value-free declaration guidance.
 * @param result - Public metadata, excluding default and source values.
 * @returns Stable human output.
 */
export function formatExplain(result: EnvExplainPresentation): string {
  return [
    result.name,
    `type: ${result.type}`,
    `required: ${result.required ? "yes" : "no"}`,
    `requiredIn: ${result.requiredIn.join(", ") || "none"}`,
    `default: ${result.hasDefault ? "yes" : "no"}`,
    `sensitive: ${result.sensitive ? "yes" : "no"}`,
    ...(result.description === undefined ? [] : [`description: ${result.description}`]),
  ].join("\n");
}
