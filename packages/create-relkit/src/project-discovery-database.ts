import { posix } from "node:path";
import * as ts from "typescript";
import type { DatabaseDialect } from "./add-types.js";
import { readFactoryObject, staticPropertyName } from "./source-edit.js";

interface SourceModule {
  readonly fileName: string;
  readonly text: string;
}

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

function dialectOf(source: string): readonly DatabaseDialect[] {
  if (source.includes("drizzle-orm/sqlite-core") || source.includes("drizzle-orm/bun-sqlite"))
    return ["sqlite"];
  if (source.includes("drizzle-orm/pg-core") || source.includes("drizzle.postgres"))
    return ["postgresql"];
  if (source.includes("drizzle-orm/mysql-core") || source.includes("drizzle.mysql"))
    return ["mysql"];
  return [];
}
