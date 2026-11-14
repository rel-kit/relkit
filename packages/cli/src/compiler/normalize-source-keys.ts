/**
 * Locates application declarations that evaluation does not record: a provider binding's entry in
 * the configuration, and an environment variable's key in its `defineEnv` call. Evaluation records
 * where a descriptor is exported, so without these every binding and variable would point at the
 * `defineApp(` call. The scan reads source text only.
 */
import type { SourceLocation } from "relkit/contracts";
import ts from "../typescript-parser.js";

/** Source text of one application file, with its project-relative name. */
interface SourceText {
  readonly fileName: string;
  readonly text: string;
}

/** A located object literal property. */
interface KeyLocation {
  readonly name: string;
  readonly location: SourceLocation;
  readonly node: ts.PropertyAssignment;
}

/**
 * Locates a provider binding entry: the profile key inside the capability's object literal, such
 * as `local` in `bucket: { local: docker(s3()) }`.
 * @param sources - Application files.
 * @param preferredFile - File of the application descriptor, searched first.
 * @param capability - Provider capability key.
 * @param profile - Profile key.
 * @returns The profile key's location; else the capability key's location in the preferred file;
 * else undefined, including when other files hold more than one match.
 */
export function providerEntryLocation(
  sources: readonly SourceText[],
  preferredFile: string,
  capability: string,
  profile: string,
): SourceLocation | undefined {
  const entries = (source: SourceText) =>
    objectKeys(source, capability).flatMap((key) =>
      ts.isObjectLiteralExpression(key.node.initializer)
        ? childKeys(source, key.node.initializer).filter((entry) => entry.name === profile)
        : [],
    );
  const preferred = sources.find((source) => source.fileName === preferredFile);
  if (preferred !== undefined) {
    const found = entries(preferred)[0] ?? objectKeys(preferred, capability)[0];
    if (found !== undefined) return found.location;
  }
  const others = sources
    .filter((source) => source.fileName !== preferredFile)
    .flatMap((source) => entries(source));
  return others.length === 1 ? others[0]!.location : undefined;
}

/**
 * Locates environment variable keys in the object literals passed to `defineEnv`.
 * @param sources - Application files.
 * @param preferredFile - File of the application descriptor, preferred when a name is declared in
 * several files.
 * @returns Name to key location, for names declared once or once in the preferred file.
 */
export function environmentKeyLocations(
  sources: readonly SourceText[],
  preferredFile: string,
): ReadonlyMap<string, SourceLocation> {
  const found = new Map<string, KeyLocation[]>();
  for (const source of sources) {
    if (!source.text.includes("defineEnv")) continue;
    const file = parse(source);
    const visit = (node: ts.Node): void => {
      const argument = ts.isCallExpression(node) ? node.arguments[0] : undefined;
      if (
        ts.isCallExpression(node) &&
        calleeName(node.expression) === "defineEnv" &&
        argument !== undefined &&
        ts.isObjectLiteralExpression(argument)
      )
        for (const key of childKeys(source, argument, file))
          found.set(key.name, [...(found.get(key.name) ?? []), key]);
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  const locations = new Map<string, SourceLocation>();
  for (const [name, keys] of found) {
    const chosen =
      keys.length === 1 ? keys[0] : keys.find((key) => key.location.file === preferredFile);
    if (chosen !== undefined) locations.set(name, chosen.location);
  }
  return locations;
}

/**
 * Lists every object literal property with a given name.
 * @param source - Application file.
 * @param name - Property name.
 * @returns Located properties in source order.
 */
function objectKeys(source: SourceText, name: string): KeyLocation[] {
  if (!source.text.includes(name)) return [];
  const file = parse(source);
  const found: KeyLocation[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isObjectLiteralExpression(node))
      found.push(...childKeys(source, node, file).filter((entry) => entry.name === name));
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

/**
 * Lists the named properties of one object literal.
 * @param source - Application file.
 * @param literal - Object literal.
 * @param file - Parsed file, when already parsed.
 * @returns Properties with a static name, with the location of the name.
 */
function childKeys(
  source: SourceText,
  literal: ts.ObjectLiteralExpression,
  file = literal.getSourceFile(),
): KeyLocation[] {
  return literal.properties.flatMap((property) => {
    if (!ts.isPropertyAssignment(property)) return [];
    const name = property.name;
    const text =
      ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)
        ? name.text
        : undefined;
    if (text === undefined) return [];
    const { line, character } = file.getLineAndCharacterOfPosition(name.getStart(file));
    return [
      {
        name: text,
        node: property,
        location: { file: source.fileName, line: line + 1, column: character + 1 },
      },
    ];
  });
}

/**
 * Names the function a call invokes.
 * @param expression - Callee.
 * @returns `name` for `name(…)` and `object.name(…)`, else undefined.
 */
function calleeName(expression: ts.Expression): string | undefined {
  if (ts.isIdentifier(expression)) return expression.text;
  return ts.isPropertyAccessExpression(expression) ? expression.name.text : undefined;
}

/** Parsed files by text, so one normalization parses each file once. */
const parsed = new WeakMap<SourceText, ts.SourceFile>();

/**
 * Parses an application file once per source object.
 * @param source - Application file.
 * @returns Its syntax tree with parent links.
 */
function parse(source: SourceText): ts.SourceFile {
  const cached = parsed.get(source);
  if (cached !== undefined) return cached;
  const file = ts.createSourceFile(source.fileName, source.text, ts.ScriptTarget.Latest, true);
  parsed.set(source, file);
  return file;
}
