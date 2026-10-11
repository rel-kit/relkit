/** Parses explicit project flags without importing application code or acquiring resources. */
import { CliFailureError } from "../cli-errors.js";
import type { MinimumLogLevel } from "@relkit/runtime-effect";
import { Schema } from "effect";
import { minimumLogLevelSchema } from "./project-args.schemas.js";
import type { ProjectArgs } from "./project-args.types.js";
export type { ProjectArgs } from "./project-args.types.js";

/**
 * Parses the established shared flags without reading configuration or acquiring services.
 * @param args - Original option tokens.
 * @param command - Selected command used by existing usage diagnostics.
 * @returns Explicit validated overrides; unknown options retain usage status two.
 */
export function parseProjectArgs(args: readonly string[], command: string): ProjectArgs {
  let projectRoot: string | undefined;
  let port: number | undefined;
  let inspectorPort: number | undefined;
  let local: "on" | "off" | undefined;
  let logLevel: MinimumLogLevel | undefined;
  let verbose = false;
  let noColor = false;
  let prepare = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--project-root") projectRoot = value(args, ++index, argument, command);
    else if (argument === "--port")
      port = portValue(value(args, ++index, argument, command), command);
    else if (argument === "--inspector-port")
      inspectorPort = portValue(value(args, ++index, argument, command), command);
    else if (argument === "--local" && command === "dev") {
      const selected = value(args, ++index, argument, command);
      if (selected !== "on" && selected !== "off")
        throw fail("RELKIT_DEV_USAGE", "--local must be on or off.", 2);
      local = selected;
    } else if (argument === "--verbose" && command === "dev") verbose = true;
    else if (argument === "--no-color" && command === "dev") noColor = true;
    else if (argument === "--prepare" && command === "dev") prepare = true;
    else if (argument === "--log-level" && command === "dev") {
      const selected = value(args, ++index, argument, command);
      if (!Schema.is(minimumLogLevelSchema)(selected))
        throw fail("RELKIT_DEV_USAGE", "Unknown log level.", 2);
      logLevel = selected;
    } else
      throw fail(
        `RELKIT_${command.toUpperCase()}_USAGE`,
        `Unknown ${command} option: ${argument}`,
        2,
      );
  }
  return {
    ...(projectRoot === undefined ? {} : { projectRoot }),
    ...(port === undefined ? {} : { port }),
    ...(inspectorPort === undefined ? {} : { inspectorPort }),
    ...(local === undefined ? {} : { local }),
    ...(logLevel === undefined ? {} : { logLevel }),
    verbose,
    noColor,
    ...(prepare ? { prepare } : {}),
  };
}

/**
 * Constructs the established usage error without importing command dispatch.
 * @param code - Selected command's existing public code.
 * @param message - Safe parser diagnostic.
 * @param exitCode - Existing usage status.
 * @returns The same typed public failure contract.
 */
function fail(code: string, message: string, exitCode: number): CliFailureError {
  return new CliFailureError({ code, message, exitCode });
}

/**
 * Requires one following option value while preserving usage error wording.
 * @param args - Original tokens.
 * @param index - Position following the current option.
 * @param option - Option label used in the diagnostic.
 * @param command - Selected command used by the error code.
 * @returns The accepted non-option token.
 */
function value(args: readonly string[], index: number, option: string, command: string): string {
  const result = args[index];
  if (result === undefined || result.startsWith("-"))
    throw fail(`RELKIT_${command.toUpperCase()}_USAGE`, `${option} requires a value.`, 2);
  return result;
}

/**
 * Validates a native listener override, including an ephemeral port of zero.
 * @param value - Original decimal token.
 * @param command - Selected command used by the error code.
 * @returns A safe integer from zero through 65535.
 */
function portValue(value: string, command: string): number {
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535)
    throw fail(`RELKIT_${command.toUpperCase()}_USAGE`, "Port must be between 0 and 65535.", 2);
  return port;
}
