import { dirname, join, resolve } from "node:path";
import * as ts from "typescript";
import { ADD_FAILURE_CODES, AddScaffoldError } from "./add-types.js";
import type { DiscoveredProfile } from "./project-discovery-types.js";
import { readFactoryObject, staticPropertyName } from "./source-edit.js";

/**
 * Provider capabilities recognized in static app configuration.
 */
const CAPABILITIES = ["bucket", "cache", "job", "event", "model"] as const;

/**
 * Reads the canonical app factory and its source-declared environment/providers.
 * @param source - Authored source text inspected or transformed without execution.
 * @param path - Path inside the current project or owned resource.
 * @param root - Absolute project or owned resource root.
 * @returns The recognized app factory, optional environment source path and provider profiles.
 */
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

/**
 * Reads provider profiles, aliases and default selections from app configuration.
 * @param object - App factory's object-literal argument.
 * @returns Source-discovered provider profile facts without importing the configuration.
 */
function readProfiles(object: ts.ObjectLiteralExpression): DiscoveredProfile[] {
  const defaults = objectPropertyObject(object, "defaults");
  return CAPABILITIES.flatMap((capability) => {
    const item = profileProperty(object, capability);
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
          isDefault:
            defaultValue(defaults, capability === "job" ? "jobs" : capability) === name ||
            (capability === "job" && defaultValue(defaults, "job") === name) ||
            (direct && name === "default"),
        },
      ];
    });
  });
}

/**
 * Resolves the statically imported environment source for a shorthand env property.
 * @param source - Authored source text inspected or transformed without execution.
 * @param object - Object-literal AST whose properties are inspected.
 * @param appPath - App configuration source path used to resolve its imports.
 * @param root - Absolute project or owned resource root.
 * @returns The environment import's resolved TypeScript path, or undefined when not statically discoverable.
 */
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

/**
 * Finds a statically named app configuration property.
 * @param object - App configuration object-literal AST.
 * @param name - Authored name or declaration key.
 * @returns The matching property, or undefined when absent.
 */
function objectProperty(object: ts.ObjectLiteralExpression, name: string) {
  return object.properties.find((item) => staticPropertyName(item.name) === name);
}
/**
 * Reads the capability property, including the jobs/job alias.
 * @param object - App configuration object-literal AST.
 * @param capability - Requested provider capability.
 * @returns The matching capability declaration, or undefined when absent.
 */
function profileProperty(object: ts.ObjectLiteralExpression, capability: string) {
  return capability === "job"
    ? (objectProperty(object, "jobs") ?? objectProperty(object, "job"))
    : objectProperty(object, capability);
}
/**
 * Reads a statically declared object-valued property.
 * @param object - Owning object-literal AST.
 * @param name - Authored name or declaration key.
 * @returns The unwrapped object literal, or undefined for absent/nonliteral values.
 */
function objectPropertyObject(object: ts.ObjectLiteralExpression, name: string) {
  const item = objectProperty(object, name);
  const value = item && ts.isPropertyAssignment(item) ? unwrap(item.initializer) : undefined;
  return value && ts.isObjectLiteralExpression(value) ? value : undefined;
}
/**
 * Reads one literal default selection from app configuration.
 * @param object - Object-literal AST whose properties are inspected.
 * @param name - Authored name or declaration key.
 * @returns The declared string default, or undefined for absent/nonliteral properties.
 */
function defaultValue(
  object: ts.ObjectLiteralExpression | undefined,
  name: string,
): string | undefined {
  const item = object && objectProperty(object, name);
  return item && ts.isPropertyAssignment(item) && ts.isStringLiteralLike(item.initializer)
    ? item.initializer.text
    : undefined;
}
/**
 * Reads static constructor names, including nested adapter wrappers.
 * @param call - Call-expression AST inspected without evaluation.
 * @returns The static adapter name including nested constructor names, or undefined for dynamic calls.
 */
function callName(call: ts.CallExpression): string | undefined {
  const name = ts.isIdentifier(call.expression)
    ? call.expression.text
    : ts.isPropertyAccessExpression(call.expression)
      ? call.expression.name.text
      : undefined;
  if (name === undefined) return undefined;
  const nested = call.arguments
    .map((argument) => unwrap(argument))
    .find(
      (argument): argument is ts.CallExpression =>
        argument !== undefined && ts.isCallExpression(argument),
    );
  const nestedName = nested === undefined ? undefined : callName(nested);
  return nestedName === undefined ? name : `${name}(${nestedName})`;
}
/**
 * Reads one literal option from a constructor's first object argument.
 * @param call - Call-expression AST inspected without evaluation.
 * @param name - Authored name or declaration key.
 * @returns The string option from the first object argument, or undefined when nonliteral or absent.
 */
function callStringOption(call: ts.CallExpression, name: string): string | undefined {
  const value = unwrap(call.arguments[0]);
  if (!value || !ts.isObjectLiteralExpression(value)) return undefined;
  const item = objectProperty(value, name);
  return item && ts.isPropertyAssignment(item) && ts.isStringLiteralLike(item.initializer)
    ? item.initializer.text
    : undefined;
}
/**
 * Removes parentheses and TypeScript assertions from a source expression.
 * @param value - AST expression whose static wrapper nodes are ignored.
 * @returns The underlying expression, or undefined when no expression was supplied.
 */
function unwrap(value: ts.Expression | undefined): ts.Expression | undefined {
  return value &&
    (ts.isAsExpression(value) ||
      ts.isSatisfiesExpression(value) ||
      ts.isParenthesizedExpression(value))
    ? unwrap(value.expression)
    : value;
}
/**
 * Omits absent fields when constructing a public result.
 * @typeParam Name - Literal property key retained in the mapped result.
 * @typeParam Value - Value type retained for the optional property.
 * @param name - Result property key.
 * @param value - Defined property value or undefined to omit it.
 * @returns An empty object for undefined, otherwise an object containing the named field.
 */
function optional<Name extends string, Value>(
  name: Name,
  value: Value | undefined,
): { readonly [Key in Name]?: Value } {
  return value === undefined ? {} : ({ [name]: value } as { readonly [Key in Name]: Value });
}
