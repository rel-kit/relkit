import { canonicalJson } from "@relkit/contracts";
import type {
  CliFailure,
  CliIo,
  CliReporter,
  CreateRelkitGeneratorApi,
} from "./main-support-types.js";
import manifest from "../package.json" with { type: "json" };
import { findCliHelp, getCliHelpModel } from "./cli-help-model.js";
import { CliFailureError, cliOriginalError } from "./cli-errors.js";
import { Effect, Layer } from "effect";
import { cliPromise, cliAdapterError } from "./cli-errors.js";
import { runCliEffect } from "./cli-runtime.js";

export type * from "./main-support-types.js";

/** Version of this installed CLI package. */
export const CLI_VERSION = manifest.version;
/** Stable command, usage and native-signal exit statuses. */
export const CLI_EXIT_CODES = Object.freeze({
  success: 0,
  failure: 1,
  usage: 2,
  sigint: 130,
  sigterm: 143,
});
/**
 * Imports the optional generator using the existing public Promise contract.
 * @returns The original module API identity.
 * @throws The established unavailable-API failure.
 */
export function loadCreateRelkit(): Promise<CreateRelkitGeneratorApi> {
  return runCliEffect(loadCreateRelkitEffect, Layer.empty);
}

/** Imports one foreign namespace lazily without creating a nested command runtime. */
export const loadCreateRelkitEffect = cliPromise(
  "generator.import",
  () => import("create-relkit"),
).pipe(
  Effect.mapError(() =>
    cliAdapterError(
      "generator.import",
      fail("RELKIT_CREATE_API_UNAVAILABLE", "The create-relkit generator API is unavailable."),
    ),
  ),
  Effect.flatMap((loaded) => {
    const value = "default" in loaded ? (loaded.default ?? loaded) : loaded;
    return isGeneratorApi(value)
      ? Effect.succeed(value)
      : Effect.fail(
          cliAdapterError(
            "generator.import",
            fail(
              "RELKIT_CREATE_API_UNAVAILABLE",
              "The create-relkit generator API is unavailable.",
            ),
          ),
        );
  }),
);

/**
 * Builds the existing result/error presentation policy.
 * @param json - Whether to serialize exactly one canonical result per call.
 * @param io - Caller-owned stdout/stderr sinks.
 * @returns A pure reporter preserving human and machine-readable contracts.
 */
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
/**
 * Projects public machine-readable help from pure command metadata.
 * @param version - Installed or explicitly injected version.
 * @param command - Optional command path.
 * @returns The unchanged help payload.
 */
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
/**
 * Formats the existing compact human help.
 * @param version - Installed or injected version.
 * @param command - Optional root command.
 * @returns Stable usage and command lines.
 */
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
/**
 * Installs native process cancellation for one invocation owner.
 * @param controller - Invocation-owned controller.
 * @returns The removal callback, called in the public edge's finally block.
 */
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
/**
 * Preserves signal-specific public cancellation codes.
 * @param signal - Received native signal.
 * @returns The established interruption failure.
 */
export function failSignal(signal: "SIGINT" | "SIGTERM"): CliFailure {
  return fail("RELKIT_INTERRUPTED", `Received ${signal}.`, signal === "SIGINT" ? 130 : 143, signal);
}
/**
 * Constructs the typed product failure while retaining public code/exit fields.
 * @param code - Existing product or usage code.
 * @param message - Existing public diagnostic.
 * @param exitCode - Existing exit status, defaulting to failure.
 * @param signal - Optional native signal.
 * @returns An Error-compatible tagged failure.
 */
export function fail(
  code: string,
  message: string,
  exitCode = 1,
  signal?: "SIGINT" | "SIGTERM",
): CliFailureError {
  return new CliFailureError({
    code,
    message,
    exitCode,
    ...(signal === undefined ? {} : { signal }),
  });
}
/**
 * Applies the terminal invocation error policy after owned cleanup completes.
 * @param error - Original failure or cause restored at the compatibility edge.
 * @param signal - Invocation cancellation, which retains precedence.
 * @returns Existing public failure fields without exposing cause payloads.
 */
export function toFailure(error: unknown, signal: AbortSignal): CliFailure {
  error = cliOriginalError(error);
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
/**
 * Formats an existing terminal diagnostic without changing Error identity.
 * @param error - Error or other thrown value.
 * @returns Existing message or native string representation.
 */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
/**
 * Validates the minimal foreign facade while preserving its original identity.
 * @param value - Untrusted imported namespace or caller substitute.
 * @returns Whether the existing required operations are present.
 */
export function isGeneratorApi(value: unknown): value is CreateRelkitGeneratorApi {
  if (value === null || typeof value !== "object") return false;
  return (
    "normalizeCreateOptions" in value &&
    typeof value.normalizeCreateOptions === "function" &&
    "generateProject" in value &&
    typeof value.generateProject === "function"
  );
}
/**
 * Narrows public error fields without trusting a tagged string or casting authority.
 * @param value - Terminal thrown value or cancellation reason.
 * @returns Whether the existing failure contract is satisfied.
 */
function isFailure(value: unknown): value is CliFailure {
  return (
    value instanceof Error &&
    "code" in value &&
    typeof value.code === "string" &&
    "exitCode" in value &&
    typeof value.exitCode === "number" &&
    (!("signal" in value) ||
      value.signal === undefined ||
      value.signal === "SIGINT" ||
      value.signal === "SIGTERM")
  );
}
