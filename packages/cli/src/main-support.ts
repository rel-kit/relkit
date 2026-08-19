import { canonicalJson } from "@zsys/contracts";
import type { LogLevel, LogRecord } from "@zsys/runtime-effect";

export const CLI_VERSION = "0.0.0" as const;
export const CLI_EXIT_CODES = Object.freeze({
  success: 0,
  failure: 1,
  usage: 2,
  sigint: 130,
  sigterm: 143,
});
const COMMANDS = Object.freeze([
  "dev",
  "check",
  "build",
  "start",
  "graph",
  "env",
  "doctor",
  "create",
  "deploy",
]);

export interface CliIo {
  readonly stdout: (line: string) => void;
  readonly stderr: (line: string) => void;
}
export interface ParsedCliArgs {
  readonly command: string | undefined;
  readonly args: readonly string[];
  readonly json: boolean;
  readonly help: boolean;
  readonly version: boolean;
  readonly error: string | undefined;
}
export interface CliReporter {
  readonly output: (value: unknown, human?: string) => void;
  readonly error: (code: string, message: string) => void;
}
export type CliLogger = (
  level: LogLevel,
  message: string,
  fields?: Readonly<Record<string, unknown>>,
) => void;
export interface CliCommandContext {
  readonly command: string;
  readonly args: readonly string[];
  readonly json: boolean;
  readonly signal: AbortSignal;
  readonly reporter: CliReporter;
  readonly log: CliLogger;
}
export interface CreateZsysGeneratorApi {
  readonly normalizeCreateOptions: (
    args: readonly string[],
    context: { readonly json: boolean },
  ) => unknown;
  readonly generateProject: (
    options: unknown,
    context: CliCommandContext,
  ) => unknown | Promise<unknown>;
}
export interface CliRuntime {
  readonly io?: CliIo;
  readonly version?: string;
  readonly signal?: AbortSignal;
  readonly installSignalHandlers?: boolean;
  readonly loadCreateZsys?: () => Promise<CreateZsysGeneratorApi>;
}
export type CliFailure = Error & {
  readonly code: string;
  readonly exitCode: number;
  readonly signal?: "SIGINT" | "SIGTERM";
};

export function parseCliArgs(argv: readonly string[]): ParsedCliArgs {
  let command: string | undefined;
  let json = false;
  let help = false;
  let version = false;
  let passthrough = false;
  const args: string[] = [];
  for (const token of argv) {
    if (passthrough) {
      if (command === undefined) command = token;
      else args.push(token);
    } else if (token === "--") passthrough = true;
    else if (token === "--json") json = true;
    else if (token === "--help" || token === "-h") help = true;
    else if (token === "--version" || token === "-v") version = true;
    else if (command === undefined && token.startsWith("-"))
      return { command, args, json, help, version, error: `Unknown option: ${token}` };
    else if (command === undefined) command = token;
    else args.push(token);
  }
  if (help && version)
    return { command, args, json, help, version, error: "--help and --version are exclusive" };
  if (command === "help")
    return { command: args[0], args: [], json, help: true, version: false, error: undefined };
  if (command === "version" && args.length === 0)
    return { command: undefined, args, json, help: false, version: true, error: undefined };
  return { command, args, json, help, version, error: undefined };
}

export async function loadCreateZsys(): Promise<CreateZsysGeneratorApi> {
  let loaded: { readonly default?: unknown } & Partial<CreateZsysGeneratorApi>;
  try {
    loaded = (await import("create-zsys")) as unknown as typeof loaded;
  } catch {
    throw fail("ZSYS_CREATE_API_UNAVAILABLE", "The create-zsys generator API is unavailable.");
  }
  const value = loaded.default ?? loaded;
  if (!isGeneratorApi(value))
    throw fail("ZSYS_CREATE_API_UNAVAILABLE", "The create-zsys generator API is unavailable.");
  return value;
}

export function createReporter(json: boolean, io: CliIo): CliReporter {
  return {
    output: (value, human) =>
      io.stdout(
        json
          ? canonicalJson(value)
          : (human ?? (typeof value === "string" ? value : canonicalJson(value))),
      ),
    error: (code, message) => {
      const value = { ok: false, error: { code, message } };
      if (json) io.stdout(canonicalJson(value));
      else io.stderr(`${code}: ${message}`);
    },
  };
}
export function helpPayload(version: string, command: string | undefined): unknown {
  return {
    name: "zsys",
    version,
    usage: command ? `zsys ${command} [options]` : "zsys [--json] <command> [options]",
    commands: COMMANDS,
  };
}
export function helpText(version: string, command: string | undefined): string {
  const usage = command ? `zsys ${command} [options]` : "zsys [--json] <command> [options]";
  const lines = [
    `zsys ${version}`,
    `Usage: ${usage}`,
    "",
    "Commands:",
    ...COMMANDS.map((name) => `  ${name}`),
    "",
    "Global options:",
    "  --json",
    "  --help",
    "  --version",
  ];
  return lines.join("\n");
}
export function installSignals(controller: AbortController): () => void {
  const handlers = [
    ["SIGINT", () => controller.abort(failSignal("SIGINT"))],
    ["SIGTERM", () => controller.abort(failSignal("SIGTERM"))],
  ] as const;
  for (const [signal, handler] of handlers) process.on(signal, handler);
  return () => {
    for (const [signal, handler] of handlers) process.removeListener(signal, handler);
  };
}
export function failSignal(signal: "SIGINT" | "SIGTERM"): CliFailure {
  return fail("ZSYS_INTERRUPTED", `Received ${signal}.`, signal === "SIGINT" ? 130 : 143, signal);
}
export function fail(
  code: string,
  message: string,
  exitCode = 1,
  signal?: "SIGINT" | "SIGTERM",
): CliFailure {
  const error = new Error(message) as CliFailure;
  Object.assign(error, { code, exitCode, ...(signal === undefined ? {} : { signal }) });
  return error;
}
export function toFailure(error: unknown, signal: AbortSignal): CliFailure {
  if (signal.aborted)
    return isFailure(signal.reason)
      ? signal.reason
      : fail("ZSYS_INTERRUPTED", "Operation interrupted.", 130);
  return isFailure(error) ? error : fail("ZSYS_INTERNAL_ERROR", errorMessage(error));
}
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
export function isGeneratorApi(value: unknown): value is CreateZsysGeneratorApi {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.normalizeCreateOptions === "function" &&
    typeof candidate.generateProject === "function"
  );
}
function isFailure(value: unknown): value is CliFailure {
  return value instanceof Error && typeof (value as Partial<CliFailure>).code === "string";
}
