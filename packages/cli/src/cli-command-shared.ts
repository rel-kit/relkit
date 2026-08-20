import { Option } from "effect";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { findCliHelp, type CliHelpCommand, type CliHelpOption } from "./cli-help-model.js";

export type SelectInvocation = (command: string, args: readonly string[]) => void;

export function docs(path: readonly string[]): CliHelpCommand {
  const value = findCliHelp(path);
  if (!value) throw new Error(`CLI help metadata is missing for ${path.join(" ")}.`);
  return value;
}

export function document<Name extends string, Input, ContextInput, E, R>(
  command: Command.Command<Name, Input, ContextInput, E, R>,
  path: readonly string[],
): Command.Command<Name, Input, ContextInput, E, R> {
  const metadata = docs(path);
  return command.pipe(
    Command.withDescription(metadata.description),
    Command.withExamples(metadata.examples),
  );
}

export function booleanFlag(path: readonly string[], name: string) {
  return aliases(Flag.boolean(name), helpOption(path, name)).pipe(
    Flag.withDescription(helpOption(path, name).description),
  );
}

export function optionalString(path: readonly string[], name: string) {
  return aliases(Flag.string(name), helpOption(path, name)).pipe(
    Flag.withDescription(helpOption(path, name).description),
    Flag.optional,
  );
}

export function optionalInteger(path: readonly string[], name: string, allowZero = false) {
  return aliases(Flag.integer(name), helpOption(path, name)).pipe(
    Flag.filter(
      (value) => value >= (allowZero ? 0 : 1) && value <= 65_535,
      () => `${name} must be between ${allowZero ? 0 : 1} and 65535`,
    ),
    Flag.withDescription(helpOption(path, name).description),
    Flag.optional,
  );
}

export function optionalChoice(path: readonly string[], name: string) {
  const metadata = helpOption(path, name);
  if (!metadata.values || metadata.values.length === 0)
    throw new Error(`CLI choice metadata is missing for --${name}.`);
  return aliases(Flag.choice(name, metadata.values), metadata).pipe(
    Flag.withDescription(metadata.description),
    Flag.optional,
  );
}

export function optionalKeyValue(path: readonly string[], name: string) {
  return aliases(Flag.keyValuePair(name), helpOption(path, name)).pipe(
    Flag.withDescription(helpOption(path, name).description),
    Flag.optional,
  );
}

export function stringArgument(path: readonly string[], name: string): Argument.Argument<string>;
export function stringArgument(
  path: readonly string[],
  name: string,
  required: true,
): Argument.Argument<string>;
export function stringArgument(
  path: readonly string[],
  name: string,
  required: false,
): Argument.Argument<Option.Option<string>>;
export function stringArgument(path: readonly string[], name: string, required = true) {
  const metadata = docs(path).arguments.find((entry) => entry.name === name);
  if (!metadata) throw new Error(`CLI argument metadata is missing for ${name}.`);
  const argument = Argument.string(name).pipe(Argument.withDescription(metadata.description));
  return required ? argument : argument.pipe(Argument.optional);
}

export function optionArgs(name: string, value: Option.Option<string | number>): readonly string[] {
  return Option.isSome(value) ? [`--${name}`, String(value.value)] : [];
}

export function booleanArgs(name: string, enabled: boolean): readonly string[] {
  return enabled ? [`--${name}`] : [];
}

export function keyValueArgs(
  name: string,
  value: Option.Option<Readonly<Record<string, string>>>,
): readonly string[] {
  return Option.isSome(value)
    ? Object.entries(value.value)
        .sort(([left], [right]) => left.localeCompare(right))
        .flatMap(([key, entry]) => [`--${name}`, `${key}=${entry}`])
    : [];
}

function helpOption(path: readonly string[], name: string): CliHelpOption {
  const value = docs(path).options.find((entry) => entry.name === name);
  if (!value) throw new Error(`CLI option metadata is missing for --${name}.`);
  return value;
}

function aliases<A>(flag: Flag.Flag<A>, metadata: CliHelpOption): Flag.Flag<A> {
  return (metadata.aliases ?? []).reduce((current, alias) => Flag.withAlias(current, alias), flag);
}
