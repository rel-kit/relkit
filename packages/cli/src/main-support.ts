import { canonicalJson } from "@relkit/contracts";
import type {
  CliFailure,
  CliIo,
  CliReporter,
  CreateRelkitGeneratorApi,
} from "./main-support-types.js";
import manifest from "../package.json" with { type: "json" };
import { findCliHelp, getCliHelpModel } from "./cli-help-model.js";

export type * from "./main-support-types.js";

export const CLI_VERSION = manifest.version;
export const CLI_EXIT_CODES = Object.freeze({
  success: 0,
  failure: 1,
  usage: 2,
  sigint: 130,
  sigterm: 143,
});
export async function loadCreateRelkit(): Promise<CreateRelkitGeneratorApi> {
  let loaded: { readonly default?: unknown } & Partial<CreateRelkitGeneratorApi>;
  try {
    loaded = (await import("create-relkit")) as unknown as typeof loaded;
  } catch {
    throw fail("RELKIT_CREATE_API_UNAVAILABLE", "The create-relkit generator API is unavailable.");
  }
  const value = loaded.default ?? loaded;
  if (!isGeneratorApi(value))
    throw fail("RELKIT_CREATE_API_UNAVAILABLE", "The create-relkit generator API is unavailable.");
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
export function helpPayload(
  version: string,
  command: string | readonly string[] | undefined,
): unknown {
  const path = typeof command === "string" ? [command] : (command ?? []);
  const selected = findCliHelp(path) ?? getCliHelpModel(version);
  return {
    name: "relkit",
    version,
    usage: path.length === 0 ? "relkit [--json] <command> [options]" : selected.usage,
    commands: selected.commands.map(({ name }) => name),
  };
}
export function helpText(version: string, command: string | undefined): string {
  const selected = findCliHelp(command ? [command] : []) ?? getCliHelpModel(version);
  const usage = command ? selected.usage : "relkit [--json] <command> [options]";
  const lines = [
    `relkit ${version}`,
    `Usage: ${usage}`,
    "",
    "Commands:",
    ...selected.commands.map(({ name }) => `  ${name}`),
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
  return fail("RELKIT_INTERRUPTED", `Received ${signal}.`, signal === "SIGINT" ? 130 : 143, signal);
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
      : fail("RELKIT_INTERRUPTED", "Operation interrupted.", 130);
  if (isFailure(error)) return error;
  if (error instanceof Error && "code" in error && typeof error.code === "string") {
    return fail(error.code, error.message);
  }
  return fail("RELKIT_INTERNAL_ERROR", errorMessage(error));
}
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
export function isGeneratorApi(value: unknown): value is CreateRelkitGeneratorApi {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.normalizeCreateOptions === "function" &&
    typeof candidate.generateProject === "function"
  );
}
function isFailure(value: unknown): value is CliFailure {
  return (
    value instanceof Error &&
    typeof (value as Partial<CliFailure>).code === "string" &&
    typeof (value as Partial<CliFailure>).exitCode === "number"
  );
}
