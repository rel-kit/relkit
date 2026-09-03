import type { CliHelpArgument, CliHelpCommand, CliHelpOption } from "./cli-help-types.js";

export const devLogOptions = [
  option(
    "log-level",
    "choice",
    "Minimum terminal severity (default: info)",
    [],
    ["all", "trace", "debug", "info", "warn", "error", "fatal", "none"],
  ),
  option("verbose", "boolean", "Show debug events and full retained diagnostics"),
  option("no-color", "boolean", "Disable terminal colors"),
];

export function command(
  name: string,
  description: string,
  usage: string,
  values: Partial<Pick<CliHelpCommand, "options" | "arguments" | "commands">> = {},
): CliHelpCommand {
  return {
    name,
    description,
    usage,
    examples: [{ command: usage.replace(/[<[].*$/, "").trim(), description }],
    options: values.options ?? [],
    arguments: values.arguments ?? [],
    commands: values.commands ?? [],
  };
}

export function option(
  name: string,
  type: CliHelpOption["type"],
  description: string,
  aliases: readonly string[] = [],
  values?: readonly string[],
): CliHelpOption {
  return {
    name,
    type,
    description,
    ...(aliases.length ? { aliases } : {}),
    ...(values ? { values } : {}),
  };
}

export function argument(name: string, required: boolean, description: string): CliHelpArgument {
  return { name, required, description };
}

export function title(value: string): string {
  return value.replaceAll("-", " ").replace(/^./, (character) => character.toUpperCase());
}
