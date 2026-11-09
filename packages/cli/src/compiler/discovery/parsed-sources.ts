/**
 * Lets the warm `relkit dev` checker keep parsed authored sources across checks. Discovery,
 * source mapping, domain layout and boundary validation each read the same files; once the
 * process retains its trees, every stage of every later check reuses the tree of an unchanged
 * file, so a save parses only the files whose text changed, and values derived from a tree
 * (syntax scan, export facts) are computed once per tree. The compiler stages never mutate
 * trees or derived facts. Without retention (`relkit check`, tests) nothing is shared: every
 * parse and derivation is fresh, exactly as without this module.
 */
import { Effect } from "effect";
import ts from "../../typescript-parser.js";
import { readFactsEffect } from "./source-facts.js";
import type { ExportFacts } from "./source-facts.types.js";

/** One parsed source and the text it was parsed from. */
interface ParsedEntry {
  readonly text: string;
  readonly kind: ts.ScriptKind | undefined;
  readonly source: ts.SourceFile;
}

const entries = new Map<string, ParsedEntry>();
const derived = new WeakMap<ts.SourceFile, Map<string, unknown>>();
let retained = false;

/**
 * Keeps parsed sources across checks for the rest of the process.
 * @remarks Development-only; a one-shot check releases its trees when it finishes.
 */
export function retainParsedSources(): void {
  retained = true;
}

/**
 * Says whether parsed sources and other compiler state outlive one check.
 * @returns True after {@link retainParsedSources}.
 */
export function parsedSourcesRetained(): boolean {
  return retained;
}

/**
 * Parses an authored source, reusing the tree of an identical earlier parse.
 * @param fileName - Name recorded in the tree; also the memo key.
 * @param text - Complete source text.
 * @param kind - Script kind; undefined lets TypeScript infer it from the file name.
 * @returns A syntax tree with parent pointers set.
 */
export function parseSourceText(
  fileName: string,
  text: string,
  kind?: ts.ScriptKind,
): ts.SourceFile {
  if (!retained) return ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind);
  const effective = kind ?? inferredKind(fileName);
  const key = `${effective ?? ""}:${fileName}`;
  const entry = entries.get(key);
  if (entry !== undefined && entry.text === text) return entry.source;
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, effective);
  entries.set(key, { text, kind: effective, source });
  return source;
}

/**
 * Names the script kind TypeScript infers from a file extension, so a caller that passes
 * the kind and one that lets TypeScript infer it share the same tree.
 * @param fileName - Source file name.
 * @returns The inferred kind, or undefined for an extension TypeScript treats specially.
 */
function inferredKind(fileName: string): ts.ScriptKind | undefined {
  if (/\.[mc]?ts$/u.test(fileName)) return ts.ScriptKind.TS;
  if (fileName.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (/\.[mc]?js$/u.test(fileName)) return ts.ScriptKind.JS;
  if (fileName.endsWith(".jsx")) return ts.ScriptKind.JSX;
  return undefined;
}

/**
 * Reads a value derived from a syntax tree, computing it once per tree.
 * @param source - Tree the value was derived from.
 * @param key - Name of the derivation.
 * @returns The memoized value, or undefined before the first computation or without retention.
 */
export function derivedValue<A>(source: ts.SourceFile, key: string): A | undefined {
  if (!retained) return undefined;
  return derived.get(source)?.get(key) as A | undefined;
}

/**
 * Records a value derived from a syntax tree.
 * @param source - Tree the value was derived from.
 * @param key - Name of the derivation.
 * @param value - Immutable derived value.
 * @returns The same value.
 */
export function rememberDerived<A>(source: ts.SourceFile, key: string, value: A): A {
  if (!retained) return value;
  const values = derived.get(source) ?? new Map<string, unknown>();
  values.set(key, value);
  derived.set(source, values);
  return value;
}

/**
 * Reads a tree's export facts once per tree.
 * @param source - Parsed source.
 * @returns A lazy effect yielding the facts {@link readFactsEffect} reports for the tree.
 */
export function sourceFactsEffect(source: ts.SourceFile) {
  const known = derivedValue<ExportFacts>(source, "facts");
  if (known !== undefined) return Effect.succeed(known);
  return readFactsEffect(source).pipe(
    Effect.map((facts) => rememberDerived(source, "facts", facts)),
  );
}
