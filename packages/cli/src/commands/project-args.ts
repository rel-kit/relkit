import { fail } from "../main-support.js";
import type { MinimumLogLevel } from "@relkit/runtime-effect";

export type ProjectArgs = {
  readonly projectRoot?: string;
  readonly port?: number;
  readonly inspectorPort?: number;
  readonly local?: "on" | "off";
  readonly logLevel?: MinimumLogLevel;
  readonly verbose?: boolean;
  readonly noColor?: boolean;
};

export function parseProjectArgs(args: readonly string[], command: string): ProjectArgs {
  let projectRoot: string | undefined;
  let port: number | undefined;
  let inspectorPort: number | undefined;
  let local: "on" | "off" | undefined;
  let logLevel: MinimumLogLevel | undefined;
  let verbose = false;
  let noColor = false;
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
    else if (argument === "--log-level" && command === "dev") {
      const selected = value(args, ++index, argument, command);
      if (!["all", "trace", "debug", "info", "warn", "error", "fatal", "none"].includes(selected))
        throw fail("RELKIT_DEV_USAGE", "Unknown log level.", 2);
      logLevel = selected as MinimumLogLevel;
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
  };
}

function value(args: readonly string[], index: number, option: string, command: string): string {
  const result = args[index];
  if (result === undefined || result.startsWith("-"))
    throw fail(`RELKIT_${command.toUpperCase()}_USAGE`, `${option} requires a value.`, 2);
  return result;
}

function portValue(value: string, command: string): number {
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535)
    throw fail(`RELKIT_${command.toUpperCase()}_USAGE`, "Port must be between 0 and 65535.", 2);
  return port;
}
