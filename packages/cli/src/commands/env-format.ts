import { canonicalJson } from "@zsys/contracts";
import type { EnvIssue, EnvMetadata, EnvProjection, EnvValueType } from "@zsys/config";

export class EnvCommandError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "EnvCommandError";
    this.code = code;
  }
}

export type EnvStatus = "set" | "default" | "optional" | "missing" | "invalid";
export type ParsedEnvArgs = {
  readonly command: "check" | "example" | "explain" | "list";
  readonly name?: string;
  readonly environment?: string;
  readonly projectRoot?: string;
  readonly examplePath?: string;
  readonly write: boolean;
};
export type EnvCommandOptions = {
  readonly projectRoot?: string;
  readonly definition?: import("@zsys/config").EnvDefinition<import("@zsys/config").EnvShape>;
  readonly source?: import("@zsys/config").EnvSource;
  readonly environment?: string;
  readonly envPath?: string;
  readonly examplePath?: string;
};
export type SafeEnvIssue = Pick<EnvIssue, "name" | "code" | "sensitive"> & {
  readonly message: string;
};

export function parseEnvArgs(args: readonly string[]): ParsedEnvArgs {
  const command = args[0];
  if (command !== "check" && command !== "example" && command !== "explain" && command !== "list")
    throw new EnvCommandError(
      "ZSYS_ENV_USAGE",
      "Usage: zsys env check|example|explain <NAME>|list [options]",
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
      throw new EnvCommandError("ZSYS_ENV_USAGE", `Unknown env option: ${arg}`);
    else if (name === undefined) name = arg;
    else
      throw new EnvCommandError("ZSYS_ENV_USAGE", "Only one environment variable name is allowed.");
  }
  if (command === "explain" && name === undefined)
    throw new EnvCommandError("ZSYS_ENV_USAGE", "env explain requires a variable name.");
  if (command !== "example" && write)
    throw new EnvCommandError("ZSYS_ENV_USAGE", "--write is only valid for env example.");
  if (command !== "example" && examplePath !== undefined)
    throw new EnvCommandError("ZSYS_ENV_USAGE", "--path is only valid for env example.");
  return {
    command,
    ...(name === undefined ? {} : { name }),
    ...(environment === undefined ? {} : { environment }),
    ...(projectRoot === undefined ? {} : { projectRoot }),
    ...(examplePath === undefined ? {} : { examplePath }),
    write,
  };
}

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

function envValue(value: unknown): string {
  if (typeof value === "string") return /[\s#"'\\\r\n]/.test(value) ? JSON.stringify(value) : value;
  return canonicalJson(value);
}
function requiredValue(args: readonly string[], index: number, option: string): string {
  const value = args[index];
  if (value === undefined || value.startsWith("-"))
    throw new EnvCommandError("ZSYS_ENV_USAGE", `${option} requires a value.`);
  return value;
}
export function isRequired(
  field: Pick<EnvMetadata, "requiredIn" | "optional">,
  environment: string,
): boolean {
  return field.requiredIn.length > 0 ? field.requiredIn.includes(environment) : !field.optional;
}
export function formatCheck(result: {
  readonly ok: boolean;
  readonly environment: string;
  readonly items: readonly { readonly name: string; readonly status: EnvStatus }[];
}): string {
  return [
    `Environment: ${result.environment}`,
    ...result.items.map((item) => `${item.name}: ${item.status}`),
    result.ok ? "Environment is valid." : "Environment is invalid.",
  ].join("\n");
}
export function formatExplain(result: {
  readonly name: string;
  readonly type: string;
  readonly requiredIn: readonly string[];
  readonly required: boolean;
  readonly hasDefault: boolean;
  readonly sensitive: boolean;
  readonly description?: string;
}): string {
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
