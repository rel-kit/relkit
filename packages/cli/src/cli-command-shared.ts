import { Option } from "effect";
import { Argument, Command, Flag } from "effect/cli";
import { findCliHelp, type CliHelpCommand, type CliHelpOption } from "./cli-help-model.js";

export type { SelectInvocation } from "./cli-command.types.js";

/**
 * Resolves static command metadata without invoking services.
 * @param path - Static command path.
 * @returns Authored help metadata.
 * @throws Error when the command definition and help inventory diverge.
 */
export function docs(path: readonly string[]): CliHelpCommand {
  const value = findCliHelp(path);
  if (!value) throw new Error(`CLI help metadata is missing for ${path.join(" ")}.`);
  return value;
}

/** Attaches static help without erasing parser output or service requirements.
 *
 * @typeParam Name - Literal name.
 * @typeParam Input - Parsed fields.
 *
 * @typeParam ContextInput - Parent fields.
 * @typeParam E - Handler failures.
 *
 * @typeParam R - Handler authority.
 *
 * @param command - Typed parser.
 * @param path - Help path.
 * @returns The same typed command.
 */
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

/**
 * Builds a boolean parser with its authored help and aliases.
 * @param path - Help path.
 * @param name - Flag name.
 * @returns Boolean syntax defaulting false.
 */
export function booleanFlag(path: readonly string[], name: string) {
  return aliases(Flag.Boolean(name), helpOption(path, name)).pipe(
    Flag.withDefault(false),
    Flag.withDescription(helpOption(path, name).description),
  );
}

/**
 * Builds an optional literal string parser.
 * @param path - Help path.
 * @param name - Flag name.
 * @returns Optional literal string syntax.
 */
export function optionalString(path: readonly string[], name: string) {
  return aliases(Flag.String(name), helpOption(path, name)).pipe(
    Flag.withDescription(helpOption(path, name).description),
    Flag.optional,
  );
}

/**
 * Builds an optional bounded integer parser.
 * @param path - Help path.
 * @param name - Flag name.
 * @param allowZero - Allows ephemeral port zero.
 *
 * @returns Optional integer syntax with the existing 1/0 through 65535 range.
 */
export function optionalInteger(path: readonly string[], name: string, allowZero = false) {
  return aliases(Flag.Int(name), helpOption(path, name)).pipe(
    Flag.filter(
      (value) => value >= (allowZero ? 0 : 1) && value <= 65_535,
      () => `${name} must be between ${allowZero ? 0 : 1} and 65535`,
    ),
    Flag.withDescription(helpOption(path, name).description),
    Flag.optional,
  );
}

/**
 * Builds authored choices using Effect CLI's literal parser.
 * @param path - Help path.
 * @param name - Flag name.
 * @returns Typed authored literal syntax.
 * @throws Error when authored choices are missing.
 */
export function optionalChoice(path: readonly string[], name: string) {
  const metadata = helpOption(path, name);
  if (!metadata.values || metadata.values.length === 0)
    throw new Error(`CLI choice metadata is missing for --${name}.`);
  return aliases(Flag.Literals(name, metadata.values), metadata).pipe(
    Flag.withDescription(metadata.description),
    Flag.optional,
  );
}

/**
 * Builds bounded repeated choice or string syntax.
 * @param path - Help path.
 * @param name - Flag name.
 * @returns At most 1024 authored choice/string values.
 */
export function repeatedString(path: readonly string[], name: string) {
  const metadata = helpOption(path, name);
  const value =
    metadata.type === "choice" && metadata.values?.length
      ? Flag.Literals(name, metadata.values)
      : Flag.String(name);
  return aliases(value, metadata).pipe(
    Flag.withDescription(metadata.description),
    Flag.atMost(1_024),
  );
}

/**
 * Builds native optional key/value syntax.
 * @param path - Help path.
 * @param name - Flag name.
 * @returns Optional native key/value syntax.
 */
export function optionalKeyValue(path: readonly string[], name: string) {
  return aliases(Flag.KeyValuePair(name), helpOption(path, name)).pipe(
    Flag.withDescription(helpOption(path, name).description),
    Flag.optional,
  );
}

/**
 * Builds typed positional string syntax.
 * @param path - Help path.
 * @param name - Positional name.
 * @returns Required string syntax.
 */
export function stringArgument(path: readonly string[], name: string): Argument.Argument<string>;
/**
 * Builds typed positional string syntax.
 * @param path - Help path.
 * @param name - Positional name.
 * @param required - Required selection.
 *
 * @returns Required string syntax.
 */
export function stringArgument(
  path: readonly string[],
  name: string,
  required: true,
): Argument.Argument<string>;
/** Builds an optional positional string parser.
 * @param path - Help path.
 * @param name - Positional name.
 * @param required - Explicit optional selection.
 * @returns Optional string syntax retaining absent values as Option.none.
 */
export function stringArgument(
  path: readonly string[],
  name: string,
  required: false,
): Argument.Argument<Option.Option<string>>;
/**
 * Builds typed positional string syntax.
 * @param path - Help path.
 * @param name - Positional name.
 * @param required - Defaults true.
 *
 * @returns Typed required/optional string syntax from authored metadata.
 * @throws Error when positional metadata is absent.
 */
export function stringArgument(path: readonly string[], name: string, required = true) {
  const metadata = docs(path).arguments.find((entry) => entry.name === name);
  if (!metadata) throw new Error(`CLI argument metadata is missing for ${name}.`);
  const argument = Argument.String(name).pipe(Argument.withDescription(metadata.description));
  return required ? argument : argument.pipe(Argument.optional);
}

/**
 * Serializes an optional named value.
 * @param name - Flag name.
 * @param value - Parsed option.
 * @returns Zero or one flag/value pair.
 */
export function optionArgs(name: string, value: Option.Option<string | number>): readonly string[] {
  return Option.isSome(value) ? [`--${name}`, String(value.value)] : [];
}

/**
 * Serializes an enabled boolean flag.
 * @param name - Flag name.
 * @param enabled - Parsed boolean.
 * @returns The enabled flag or no arguments.
 */
export function booleanArgs(name: string, enabled: boolean): readonly string[] {
  return enabled ? [`--${name}`] : [];
}

/**
 * Serializes native key/value pairs in stable key order.
 * @param name - Flag name.
 * @param value - Parsed native key/value record.
 *
 * @returns Stable key-sorted repeated literal flags.
 */
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

/**
 * Resolves authored flag metadata.
 * @param path - Help path.
 * @param name - Flag name.
 * @returns Authored flag metadata.
 * @throws Error when metadata is absent.
 */
function helpOption(path: readonly string[], name: string): CliHelpOption {
  const value = docs(path).options.find((entry) => entry.name === name);
  if (!value) throw new Error(`CLI option metadata is missing for --${name}.`);
  return value;
}

/**
 * Attaches aliases while retaining the inferred flag output.
 * @typeParam A - the inferred flag output.
 * @param flag - Typed parser.
 *
 * @param metadata - Authored aliases.
 * @returns The same parser type with native aliases.
 */
function aliases<A>(flag: Flag.Flag<A>, metadata: CliHelpOption): Flag.Flag<A> {
  return (metadata.aliases ?? []).reduce((current, alias) => Flag.withAlias(current, alias), flag);
}
