/**
 * Prints a re-exported type with the entry of its declaration. Docgen describes
 * `export type { ServerConfig } from "./app-config.types.js"` as `declare const ServerConfig:
 * ServerConfig;`, which shows none of the type's members; the declaration's own entry, with its
 * description, example and members, is elsewhere on the same page.
 */

interface Entry {
  /** Index of the entry's heading line. */
  readonly start: number;
  /** Index after the entry's last line. */
  readonly end: number;
  readonly name: string;
  /** `interface`, `type alias` and so on; empty for a value or a re-export. */
  readonly kind: string;
}

const HEADING = /^### (\S+)(?: \(([^)]+)\))?$/u;
const STUB = /^declare const (\w+): \1(?:<[^;]*>)?;$/u;

/** Finds the `###` entries of a page, ignoring headings inside code fences. */
function entries(lines: readonly string[]): Entry[] {
  const found: { start: number; name: string; kind: string }[] = [];
  const ends: number[] = [];
  let fence = "";
  lines.forEach((line, index) => {
    const marker = /^(`{3,}|~{3,})/u.exec(line)?.[1];
    if (fence) {
      if (marker?.startsWith(fence) && line.trim() === marker) fence = "";
      return;
    }
    if (marker) fence = marker;
    else if (/^#{2,3} /u.test(line)) {
      if (found.length > ends.length) ends.push(index);
      const heading = HEADING.exec(line);
      if (heading) found.push({ start: index, name: heading[1]!, kind: heading[2] ?? "" });
    }
  });
  if (found.length > ends.length) ends.push(lines.length);
  return found.map((entry, index) => ({ ...entry, end: ends[index]! }));
}

/** The first line of an entry's first code block. */
function signature(lines: readonly string[], entry: Entry): string {
  const open = lines.findIndex((line, index) => index > entry.start && line.startsWith("```"));
  return open < 0 || open >= entry.end ? "" : (lines[open + 1] ?? "");
}

/**
 * Replaces each re-export stub with the body of the declaration's entry on the same page.
 * @param page - Composed Markdown of one package reference.
 * @returns The page; a stub whose declaration is not on the page is left as it is.
 */
export function expandReExports(page: string): string {
  const lines = page.split("\n");
  const all = entries(lines);
  const declarations = new Map(
    all.filter((entry) => entry.kind !== "").map((entry) => [entry.name, entry] as const),
  );
  const output: string[] = [];
  let cursor = 0;
  for (const entry of all) {
    const declaration = declarations.get(entry.name);
    if (entry.kind !== "" || declaration === undefined) continue;
    if (STUB.exec(signature(lines, entry))?.[1] !== entry.name) continue;
    output.push(...lines.slice(cursor, entry.start + 1));
    output.push(...lines.slice(declaration.start + 1, declaration.end));
    cursor = entry.end;
  }
  output.push(...lines.slice(cursor));
  return output.join("\n");
}
