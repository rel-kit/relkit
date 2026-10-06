import { resolve } from "node:path";
import { LocalCommandError } from "./local-operation-support.js";
import type { ParsedLocalArgs } from "./local.types.js";

/**
 * Validates selected local operation flags without acquiring Docker authority.
 * @param args - Arguments after local.
 * @returns The validated operation with existing defaults.
 * @throws LocalCommandError on invalid usage.
 */
export function parseLocalArgs(args: readonly string[]): ParsedLocalArgs {
  const command = args[0];
  if (command !== "up" && command !== "status" && command !== "stop" && command !== "reset")
    throw usage("Usage: relkit local up|status|stop|reset [options]");
  let projectRoot = process.cwd();
  let detach = false;
  let yes = false;
  let dryRun = false;
  let service: string | undefined;
  let environment: string | undefined;
  for (let index = 1; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--project-root") {
      const value = args[++index];
      if (value === undefined || value.startsWith("-"))
        throw usage("--project-root requires a value.");
      projectRoot = resolve(value);
    } else if (argument === "--service") {
      const value = args[++index];
      if (value === undefined || value.startsWith("-")) throw usage("--service requires a value.");
      service = value;
    } else if (argument === "--environment" || argument === "--env") {
      const value = args[++index];
      if (value === undefined || value.startsWith("-"))
        throw usage("--environment requires a value.");
      environment = value;
    } else if (argument === "--detach" && command === "up") detach = true;
    else if (argument === "--yes" && command === "reset") yes = true;
    else if (argument === "--dry-run" && command === "reset") dryRun = true;
    else throw usage(`Unknown local ${command} option: ${String(argument)}`);
  }
  return {
    command,
    projectRoot,
    detach,
    yes,
    dryRun,
    ...(service === undefined ? {} : { service }),
    ...(environment === undefined ? {} : { environment }),
  };
}

/** Constructs the established tagged local-command usage failure.
 * @param message - Existing parser explanation.
 * @returns The established tagged local usage failure.
 */
function usage(message: string): LocalCommandError {
  return new LocalCommandError("RELKIT_LOCAL_USAGE", message);
}
