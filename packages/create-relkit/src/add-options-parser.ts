import { resolve } from "node:path";
import { ADD_FAILURE_CODES, ADD_KINDS, AddScaffoldError, type AddKind } from "./add-types.js";

/**
 * Add flags that consume a string value.
 */
const VALUE_OPTIONS = new Set([
  "project-root",
  "service",
  "create-service",
  "include",
  "event",
  "delivery",
  "profile",
  "provider",
  "source",
  "target",
  "create-function",
  "side-effect",
  "approval",
  "text",
  "model",
  "tool",
  "prompt",
  "instructions",
  "version",
  "execution",
  "mode",
  "map",
  "path",
  "orm",
  "dialect",
  "adapter",
  "database-dialect",
  "base-path",
]);
/**
 * Add flags that do not accept a value.
 */
const BOOLEAN_OPTIONS = new Set(["full", "internal", "no-install"]);

/**
 * Parsed add kind, argument values, flags, project root and explicit service selection.
 */
export interface ParsedAddArguments {
  readonly kind: AddKind;
  readonly positional?: string;
  readonly values: ReadonlyMap<string, readonly string[]>;
  readonly flags: ReadonlySet<string>;
  readonly projectRoot: string;
  readonly service?: string;
  readonly createService?: string;
  readonly install: boolean;
}

/**
 * Parses the add kind, positional name and explicit flags.
 * @param args - Literal flag and positional arguments.
 * @param cwd - Working directory for the operation.
 * @returns An immutable argument projection with repeated values and resolved project root.
 */
export function parseAddArguments(
  args: readonly string[],
  cwd: string = process.cwd(),
): ParsedAddArguments {
  const [kindValue, ...rest] = args;
  if (!ADD_KINDS.includes(kindValue as AddKind)) usage("Usage: relkit add <kind> [name] [options]");
  const values = new Map<string, string[]>();
  const flags = new Set<string>();
  let positional: string | undefined;
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index]!;
    if (!argument.startsWith("--")) {
      if (positional !== undefined) usage("Only one name or route path is allowed.");
      positional = argument;
      continue;
    }
    const [rawName, inline] = argument.slice(2).split(/=(.*)/s, 2);
    const name = rawName ?? "";
    if (BOOLEAN_OPTIONS.has(name)) {
      if (inline !== undefined) usage(`--${name} does not accept a value.`);
      flags.add(name);
      continue;
    }
    if (!VALUE_OPTIONS.has(name)) usage(`Unknown add option: --${name}`);
    const value = inline ?? rest[++index];
    if (value === undefined || value.startsWith("--")) usage(`--${name} requires a value.`);
    values.set(name, [...(values.get(name) ?? []), value]);
  }
  const projectRoot = resolve(cwd, one(values, "project-root") ?? ".");
  return Object.freeze({
    kind: kindValue as AddKind,
    ...(positional === undefined ? {} : { positional }),
    values,
    flags,
    projectRoot,
    ...optional("service", one(values, "service")),
    ...optional("createService", one(values, "create-service")),
    install: !flags.has("no-install"),
  });
}

/**
 * Reads an option that may occur at most once.
 * @param values - Parsed values grouped by flag name.
 * @param name - Flag name without leading dashes.
 * @returns The sole argument value, or undefined when omitted; repeated values raise a usage error.
 */
export function one(
  values: ReadonlyMap<string, readonly string[]>,
  name: string,
): string | undefined {
  const entries = values.get(name) ?? [];
  if (entries.length > 1) usage(`--${name} can be supplied only once.`);
  return entries[0];
}

/**
 * Projects repeated option values in their input order.
 * @param values - Parsed values grouped by flag name.
 * @param name - Flag name without leading dashes.
 * @returns A frozen copy of all values, including an empty array when omitted.
 */
export function many(
  values: ReadonlyMap<string, readonly string[]>,
  name: string,
): readonly string[] {
  return Object.freeze([...(values.get(name) ?? [])]);
}

/**
 * Validates a finite command-line choice.
 * @typeParam Value - Union of allowed option values.
 * @param value - Raw option value before finite-choice validation.
 * @param name - Flag name used in diagnostics.
 * @param allowed - Supported literal values.
 * @param fallback - Literal returned when the option is omitted.
 * @returns The declared literal choice, or the supplied fallback when omitted.
 */
export function choice<const Value extends string>(
  value: string | undefined,
  name: string,
  allowed: readonly Value[],
  fallback?: Value,
): Value | undefined {
  if (value === undefined) return fallback;
  if (allowed.includes(value as Value)) return value as Value;
  usage(`--${name} must be one of: ${allowed.join("|")}.`);
}

/**
 * Requires a nonempty argument and trims its whitespace.
 * @param value - Raw argument that may be omitted or blank.
 * @param message - Usage diagnostic for missing or blank input.
 * @returns The trimmed value; missing or blank input raises a usage error.
 */
export function required(value: string | undefined, message: string): string {
  if (value?.trim()) return value.trim();
  usage(message);
}

/**
 * Omits absent fields when constructing a public result.
 * @typeParam Name - Literal property key retained in the mapped result.
 * @typeParam Value - Value type retained for the optional property.
 * @param name - Result property key.
 * @param value - Defined property value or undefined to omit it.
 * @returns An empty object for undefined, otherwise an object containing the named field.
 */
export function optional<Name extends string, Value>(
  name: Name,
  value: Value | undefined,
): { readonly [Key in Name]?: Value } {
  return value === undefined ? {} : ({ [name]: value } as { readonly [Key in Name]: Value });
}

/**
 * Rejects unsupported or incomplete scaffold arguments.
 * @param message - Diagnostic explaining the unsupported arguments.
 * @returns No value; throws AddScaffoldError with RELKIT_ADD_USAGE.
 */
export function usage(message: string): never {
  throw new AddScaffoldError(ADD_FAILURE_CODES.usage, message);
}
