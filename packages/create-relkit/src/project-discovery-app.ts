import { dirname, join, resolve } from "node:path";
import * as ts from "typescript";
import { ADD_FAILURE_CODES, AddScaffoldError } from "./add-types.js";
import type { DiscoveredProfile } from "./project-discovery-types.js";
import { readFactoryObject, staticPropertyName } from "./source-edit.js";

const CAPABILITIES = ["bucket", "cache", "job", "event", "model"] as const;

export function readAppDiscovery(
  source: string,
  path: string,
  root: string,
): {
  readonly factory: "defineApp" | "defineConfig";
  readonly envPath?: string;
  readonly profiles: readonly DiscoveredProfile[];
} {
  for (const factory of ["defineApp", "defineConfig"] as const) {
    try {
      const object = readFactoryObject(source, path, [factory]);
      return {
        factory,
        ...optional("envPath", importedEnvPath(source, object, path, root)),
        profiles: readProfiles(object),
      };
    } catch (error) {
      if (factory === "defineConfig") throw error;
    }
  }
  throw new AddScaffoldError(
    ADD_FAILURE_CODES.unsupportedSourceShape,
    `${path} has no canonical app.`,
  );
}

function readProfiles(object: ts.ObjectLiteralExpression): DiscoveredProfile[] {
  const defaults = objectPropertyObject(object, "defaults");
  return CAPABILITIES.flatMap((capability) => {
    const item = objectProperty(object, capability);
    if (!item || !ts.isPropertyAssignment(item)) return [];
    const value = unwrap(item.initializer);
    const profiles = value && ts.isObjectLiteralExpression(value) ? value.properties : [];
    const direct = value !== undefined && ts.isCallExpression(value);
    return (direct ? [undefined] : profiles).flatMap((entry) => {
      const name = entry === undefined ? "default" : staticPropertyName(entry.name);
      if (name === undefined) return [];
      const expression =
        entry && ts.isPropertyAssignment(entry) ? unwrap(entry.initializer) : value;
      return [
        {
          capability,
          name,
          ...optional(
            "adapter",
            expression && ts.isCallExpression(expression) ? callName(expression) : undefined,
          ),
          ...optional(
            "modelId",
            capability === "model" && expression && ts.isCallExpression(expression)
              ? callStringOption(expression, "defaultModel")
              : undefined,
          ),
          isDefault: defaultValue(defaults, capability) === name || (direct && name === "default"),
        },
      ];
    });
  });
}

function importedEnvPath(
  source: string,
  object: ts.ObjectLiteralExpression,
  appPath: string,
  root: string,
): string | undefined {
  const env = objectProperty(object, "env");
  if (!env || !ts.isShorthandPropertyAssignment(env)) return undefined;
  const file = ts.createSourceFile(appPath, source, ts.ScriptTarget.Latest, true);
  const declaration = file.statements
    .filter(ts.isImportDeclaration)
    .find((statement) => statement.importClause?.name?.text === env.name.text);
  if (!declaration || !ts.isStringLiteralLike(declaration.moduleSpecifier)) return undefined;
  const specifier = declaration.moduleSpecifier.text;
  const imported = specifier.startsWith("@app/")
    ? join(root, "src", specifier.slice(5))
    : resolve(dirname(appPath), specifier);
  return imported.replace(/\.js$/, ".ts");
}

function objectProperty(object: ts.ObjectLiteralExpression, name: string) {
  return object.properties.find((item) => staticPropertyName(item.name) === name);
}
function objectPropertyObject(object: ts.ObjectLiteralExpression, name: string) {
  const item = objectProperty(object, name);
  const value = item && ts.isPropertyAssignment(item) ? unwrap(item.initializer) : undefined;
  return value && ts.isObjectLiteralExpression(value) ? value : undefined;
}
function defaultValue(
  object: ts.ObjectLiteralExpression | undefined,
  name: string,
): string | undefined {
  const item = object && objectProperty(object, name);
  return item && ts.isPropertyAssignment(item) && ts.isStringLiteralLike(item.initializer)
    ? item.initializer.text
    : undefined;
}
function callName(call: ts.CallExpression): string | undefined {
  return ts.isIdentifier(call.expression)
    ? call.expression.text
    : ts.isPropertyAccessExpression(call.expression)
      ? call.expression.name.text
      : undefined;
}
function callStringOption(call: ts.CallExpression, name: string): string | undefined {
  const value = unwrap(call.arguments[0]);
  if (!value || !ts.isObjectLiteralExpression(value)) return undefined;
  const item = objectProperty(value, name);
  return item && ts.isPropertyAssignment(item) && ts.isStringLiteralLike(item.initializer)
    ? item.initializer.text
    : undefined;
}
function unwrap(value: ts.Expression | undefined): ts.Expression | undefined {
  return value &&
    (ts.isAsExpression(value) ||
      ts.isSatisfiesExpression(value) ||
      ts.isParenthesizedExpression(value))
    ? unwrap(value.expression)
    : value;
}
function optional<Name extends string, Value>(
  name: Name,
  value: Value | undefined,
): { readonly [Key in Name]?: Value } {
  return value === undefined ? {} : ({ [name]: value } as { readonly [Key in Name]: Value });
}
