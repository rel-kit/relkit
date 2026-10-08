import type { CliHelpArgument, CliHelpCommand, CliHelpOption } from "./cli-help-model.types.js";

/** Static development logging flags; runtime configuration belongs to command services. */
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

/** Builds one help-tree node from compile-time command metadata.
 * @param name - Command or subcommand name.
 * @param description - Human-readable purpose.
 * @param usage - Complete invocation syntax, including positional placeholders.
 * @param values - Optional child commands, flags, and positional arguments.
 * @returns A pure node with an example derived from its usage prefix.
 */
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

/** Builds flag metadata without parsing or validating a user value.
 * @param name - Long flag name without the leading dashes.
 * @param type - Value kind displayed by help renderers.
 * @param description - Flag purpose and relevant default.
 * @param aliases - Alternative flag names.
 * @param values - Displayed choice values, when applicable.
 * @param repeatable - Whether the parser accepts repeated occurrences.
 * @returns A pure option record; unused optional properties remain absent.
 */
export function option(
  name: string,
  type: CliHelpOption["type"],
  description: string,
  aliases: readonly string[] = [],
  values?: readonly string[],
  repeatable = false,
): CliHelpOption {
  return {
    name,
    type,
    description,
    ...(aliases.length ? { aliases } : {}),
    ...(values ? { values } : {}),
    ...(repeatable ? { repeatable: true } : {}),
  };
}

/** Describes one positional argument in command metadata.
 * @param name - Positional placeholder name.
 * @param required - Whether omission is invalid for this command.
 * @param description - Argument meaning.
 * @returns The static positional argument record.
 */
export function argument(name: string, required: boolean, description: string): CliHelpArgument {
  return { name, required, description };
}

/** Formats a kebab-case identifier for a short help description.
 * @param value - Identifier to format.
 * @returns The identifier with spaces and its first character capitalized.
 */
export function title(value: string): string {
  return value.replaceAll("-", " ").replace(/^./, (character) => character.toUpperCase());
}
