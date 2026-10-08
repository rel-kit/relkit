import { Effect, Option } from "effect";
import { Command } from "effect/cli";
import {
  booleanFlag,
  docs,
  document,
  optionalChoice,
  optionalString,
  repeatedString,
  stringArgument,
  type SelectInvocation,
} from "./cli-command-shared.js";
import type { CliHelpOption } from "./cli-help-types.js";

import type { AddParameter } from "./cli-command.types.js";

/** Builds metadata-driven artifact parsers without invoking prompts or writes.
 *
 * @param select - Records the artifact invocation for the existing dispatcher.
 *
 * @returns The pure add command tree.
 */
export function addCommand(select: SelectInvocation) {
  const commands = docs(["add"]).commands.map((metadata) => {
    const path = ["add", metadata.name];
    const config: Record<string, AddParameter> = {};
    for (const argument of metadata.arguments) {
      config[argument.name] = argument.required
        ? stringArgument(path, argument.name, true)
        : stringArgument(path, argument.name, false);
    }
    for (const option of metadata.options) config[option.name] = addFlag(path, option);
    return document(
      Command.make(metadata.name, config, (values) =>
        Effect.sync(() => {
          select(
            "add",
            serialize(
              metadata.name,
              metadata.arguments.map(({ name }) => name),
              metadata.options,
              values,
            ),
          );
        }),
      ),
      path,
    );
  });
  const parent = Command.make("add").pipe(
    Command.withHandler(() => Effect.sync(() => select("add", []))),
    Command.withSubcommands(commands),
  );
  return document(parent, ["add"]);
}

/** Selects a parser from static option metadata.
 *
 * @param path - Command help path.
 * @param option - Authored flag metadata.
 *
 * @returns A typed flag preserving repetition, choice and default behavior.
 */
function addFlag(path: readonly string[], option: CliHelpOption) {
  if (option.repeatable) return repeatedString(path, option.name);
  if (option.type === "boolean") return booleanFlag(path, option.name);
  if (option.type === "choice") return optionalChoice(path, option.name);
  return optionalString(path, option.name);
}

/** Serializes already-parsed artifact values in metadata order.
 *
 * @param kind - Artifact kind.
 * @param arguments_ - Ordered positional names.
 *
 * @param options - Ordered flags.
 * @param values - Parsed values from Effect CLI.
 *
 * @returns Literal arguments accepted by the existing artifact resolver.
 */
function serialize(
  kind: string,
  arguments_: readonly string[],
  options: readonly CliHelpOption[],
  values: Readonly<Record<string, unknown>>,
): readonly string[] {
  const output = [kind];
  for (const name of arguments_) {
    const value = values[name];
    if (Option.isOption(value) && Option.isSome(value)) output.push(String(value.value));
    else if (typeof value === "string") output.push(value);
  }
  for (const option of options) {
    const value = values[option.name];
    if (option.repeatable && Array.isArray(value)) {
      for (const item of value) output.push(`--${option.name}`, String(item));
    } else if (option.type === "boolean" && value === true) output.push(`--${option.name}`);
    else if (Option.isOption(value) && Option.isSome(value)) {
      output.push(`--${option.name}`, String(value.value));
    }
  }
  return output;
}
