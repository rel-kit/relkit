import { resolve } from "node:path";
import { ADD_FAILURE_CODES, ADD_KINDS, AddScaffoldError, type AddKind } from "./add-types.js";

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
  "model-provider",
  "model-id",
  "mode",
  "map",
  "path",
  "orm",
  "dialect",
  "adapter",
  "database-dialect",
  "base-path",
]);
const BOOLEAN_OPTIONS = new Set(["full", "internal", "no-install"]);

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

export function one(
  values: ReadonlyMap<string, readonly string[]>,
  name: string,
): string | undefined {
  const entries = values.get(name) ?? [];
  if (entries.length > 1) usage(`--${name} can be supplied only once.`);
  return entries[0];
}

export function many(
  values: ReadonlyMap<string, readonly string[]>,
  name: string,
): readonly string[] {
  return Object.freeze([...(values.get(name) ?? [])]);
}

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

export function required(value: string | undefined, message: string): string {
  if (value?.trim()) return value.trim();
  usage(message);
}

export function optional<Name extends string, Value>(
  name: Name,
  value: Value | undefined,
): { readonly [Key in Name]?: Value } {
  return value === undefined ? {} : ({ [name]: value } as { readonly [Key in Name]: Value });
}

export function usage(message: string): never {
  throw new AddScaffoldError(ADD_FAILURE_CODES.usage, message);
}
