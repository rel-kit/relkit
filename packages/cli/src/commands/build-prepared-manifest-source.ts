import { relative, resolve } from "node:path";

export interface ManifestBinding {
  readonly alias: string;
  readonly specifier: string;
  readonly accessor: string;
}

export function importBindings(source: string): ReadonlyMap<string, ManifestBinding> {
  const result = new Map<string, ManifestBinding>();
  for (const match of source.matchAll(/^import \* as ([\w$]+) from ("[^"]+");$/gmu)) {
    const alias = match[1]!;
    result.set(alias, { alias, specifier: JSON.parse(match[2]!) as string, accessor: "" });
  }
  return result;
}

export function projectPath(specifier: string, root: string, directory: string): string {
  return relative(root, resolve(directory, specifier)).replaceAll("\\", "/");
}

export function removedDescriptorAliases(
  before: string,
  after: string,
  imports: ReadonlyMap<string, ManifestBinding>,
): readonly string[] {
  return [...imports.keys()].filter(
    (alias) => occurrences(before, alias) > occurrences(after, alias),
  );
}

export function occurrences(source: string, value: string): number {
  return [...source.matchAll(identifierPattern(value, "gu"))].length;
}

export function identityStatements(source: string, alias: string): readonly string[] {
  return source
    .split("\n")
    .filter(
      (line) =>
        line.includes("__relkit_bindDescriptorIdentity(") && referencesIdentifier(line, alias),
    )
    .map((line) => line.trim());
}

export function referencesIdentifier(source: string, value: string): boolean {
  return identifierPattern(value, "u").test(source);
}

export function identifierPattern(value: string, flags: string): RegExp {
  return new RegExp(`(?<![\\w$])${escapeRegExp(value)}(?![\\w$])`, flags);
}

export function mapEntry(source: string, property: string, id: string): string | undefined {
  return mapEntries(source, property).find((entry) => entry.id === id)?.expression;
}

export function updateMap(
  source: string,
  property: string,
  id: string,
  expression?: string,
  variadic = false,
): string {
  const parsed = mapEntries(source, property);
  if (parsed.length === 0) return source;
  const entries = parsed.flatMap((entry) =>
    entry.id !== id
      ? [entry]
      : expression === undefined
        ? []
        : [{ id, expression: variadic ? `(...args) => ${expression}` : expression }],
  );
  return source.replace(new RegExp(`^  ${property}: \\{.*\\},$`, "mu"), mapLine(property, entries));
}

export function insertMap(
  source: string,
  property: string,
  entries: readonly { readonly id: string; readonly expression: string }[],
  before: string,
): string {
  const line = mapLine(property, entries);
  return source.replace(new RegExp(`^(  ${before}: \\{.*\\},)$`, "mu"), `${line}\n$1`);
}

function mapLine(
  property: string,
  entries: readonly { readonly id: string; readonly expression: string }[],
): string {
  return `  ${property}: { ${entries.map((entry) => `${JSON.stringify(entry.id)}: ${entry.expression}`).join(", ")} },`;
}

function mapEntries(source: string, property: string): Array<{ id: string; expression: string }> {
  const line = source.match(new RegExp(`^  ${property}: \\{(.*)\\},$`, "mu"))?.[1]?.trim();
  if (!line) return [];
  return splitTopLevel(line).map((entry) => {
    const separator = entry.indexOf(": ");
    return {
      id: JSON.parse(entry.slice(0, separator)) as string,
      expression: entry.slice(separator + 2),
    };
  });
}

function splitTopLevel(source: string): string[] {
  const entries: string[] = [];
  let start = 0;
  let depth = 0;
  let quote = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!;
    if (character === '"' && source[index - 1] !== "\\") quote = !quote;
    else if (!quote && "([{".includes(character)) depth += 1;
    else if (!quote && ")]}".includes(character)) depth -= 1;
    else if (!quote && depth === 0 && character === ",") {
      entries.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }
  entries.push(source.slice(start).trim());
  return entries.filter(Boolean);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
