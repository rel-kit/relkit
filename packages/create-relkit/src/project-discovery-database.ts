import { posix } from "node:path";
import * as ts from "typescript";
import type { DatabaseDialect } from "./add-types.js";
import { readFactoryObject, staticPropertyName } from "./source-edit.js";

/**
 * Read-only source file name and text used for static database discovery.
 */
interface SourceModule {
  readonly fileName: string;
  readonly text: string;
}

/**
 * Infers database dialect and schema import facts from source modules.
 * @param modules - Source modules available for static database discovery.
 * @param servicePath - Project-relative database service source path.
 * @param source - Authored source text inspected or transformed without execution.
 * @returns The unambiguous inferred dialect and statically resolved schema path when discoverable.
 */
export function discoverDatabaseDetails(
  modules: readonly SourceModule[],
  servicePath: string,
  source: string,
): { readonly dialect?: DatabaseDialect; readonly schemaPath?: string } {
  const domain = servicePath.split("/").slice(0, -1).join("/");
  const relevant = modules.filter((module) => module.fileName.startsWith(`${domain}/`));
  const dialects = new Set(relevant.flatMap((module) => dialectOf(module.text)));
  const schemaPath = importedSchemaPath(source, servicePath);
  return {
    ...(dialects.size === 1 ? { dialect: [...dialects][0]! } : {}),
    ...(schemaPath === undefined ? {} : { schemaPath }),
  };
}

/**
 * Resolves the database service's static relative namespace schema import.
 * @param source - Authored source text inspected or transformed without execution.
 * @param servicePath - Project-relative database service source path.
 * @returns The project-relative TypeScript schema import path, or undefined for unsupported imports.
 */
function importedSchemaPath(source: string, servicePath: string): string | undefined {
  const object = readFactoryObject(source, servicePath, ["defineDrizzleService"]);
  const schema = object.properties.find((item) => staticPropertyName(item.name) === "schema");
  const binding =
    schema && ts.isShorthandPropertyAssignment(schema)
      ? schema.name.text
      : schema && ts.isPropertyAssignment(schema) && ts.isIdentifier(schema.initializer)
        ? schema.initializer.text
        : undefined;
  if (!binding) return undefined;
  const file = ts.createSourceFile(servicePath, source, ts.ScriptTarget.Latest, true);
  const declaration = file.statements
    .filter(ts.isImportDeclaration)
    .find(
      (item) =>
        item.importClause?.namedBindings &&
        ts.isNamespaceImport(item.importClause.namedBindings) &&
        item.importClause.namedBindings.name.text === binding,
    );
  if (!declaration || !ts.isStringLiteralLike(declaration.moduleSpecifier)) return undefined;
  const value = declaration.moduleSpecifier.text;
  if (!value.startsWith(".")) return undefined;
  return posix.normalize(posix.join(posix.dirname(servicePath), value.replace(/\.js$/, ".ts")));
}

/**
 * Infers a database dialect from recognized static import and adapter markers.
 * @param source - Authored source text inspected or transformed without execution.
 * @returns The inferred dialect as a single-item array, or an empty array when unknown.
 */
function dialectOf(source: string): readonly DatabaseDialect[] {
  if (source.includes("drizzle-orm/sqlite-core") || source.includes("drizzle-orm/bun-sqlite"))
    return ["sqlite"];
  if (source.includes("drizzle-orm/pg-core") || source.includes("drizzle.postgres"))
    return ["postgresql"];
  if (source.includes("drizzle-orm/mysql-core") || source.includes("drizzle.mysql"))
    return ["mysql"];
  return [];
}
