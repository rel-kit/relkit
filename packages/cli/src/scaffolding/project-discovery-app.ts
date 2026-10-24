/** Inspects application configuration syntax to discover public factory configuration and provider choices without importing executable application code. */

import {
  objectProperty,
  objectPropertyObject,
  profileProperty,
  defaultValue,
  callName,
  callStringOption,
  unwrap,
  optional,
} from "./project-discovery-app-helpers.js";
import { dirname, join, resolve } from "node:path";
import * as ts from "typescript";
import { ADD_FAILURE_CODES, AddScaffoldError } from "create-relkit/internal/add-types";
import type { DiscoveredProfile } from "./project-discovery-types.js";
import { readFactoryObject, staticPropertyName } from "./source-edit.js";
/** Provider capabilities recognized in static app configuration. */
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
