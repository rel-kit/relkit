import { Effect } from "effect";
import * as ts from "typescript";
import { observeCompiler } from "../observability.js";
import { propertyName, unwrap } from "./source-facts-syntax.js";
import type { FactoryIdPresence } from "./source-facts.types.js";

/**
 * Lists directly declared factory option names.
 * @param argument - Unevaluated options argument.
 * @returns A lazy effect yielding literal property names; spreads and computed names are omitted.
 */
export const optionNamesEffect = Effect.fn("Discovery.optionNames")(
  function* (argument: ts.Expression | undefined) {
    const value = unwrap(argument);
    if (!value || !ts.isObjectLiteralExpression(value)) return [];
    return Object.freeze(
      value.properties.flatMap((property) => {
        if (ts.isSpreadAssignment(property)) return [];
        const name = propertyName(property.name);
        return name === undefined ? [] : [name];
      }),
    );
  },
  (effect) => observeCompiler("discovery", "optionNames", effect, () => ({}), false),
);

/**
 * Collects shallow option paths for source alias diagnostics.
 * @param argument - Unevaluated options argument.
 * @returns A lazy effect yielding top-level paths and defaults/compatibility child paths.
 */
export const optionPathsEffect = Effect.fn("Discovery.optionPaths")(
  function* (argument: ts.Expression | undefined) {
    const value = unwrap(argument);
    if (!value || !ts.isObjectLiteralExpression(value)) return [];
    const paths: string[] = [];
    for (const property of value.properties) {
      if (ts.isSpreadAssignment(property)) continue;
      const name = propertyName(property.name);
      if (name === undefined) continue;
      paths.push(name);
      if (name !== "defaults" && name !== "compatibility") continue;
      if (!ts.isPropertyAssignment(property)) continue;
      const nested = unwrap(property.initializer);
      if (!nested || !ts.isObjectLiteralExpression(nested)) continue;
      for (const child of nested.properties) {
        const childName = propertyName(child.name);
        if (childName !== undefined) paths.push(`${name}.${childName}`);
      }
    }
    return Object.freeze(paths);
  },
  (effect, argument) => observeCompiler("discovery", "optionPaths", effect, () => ({}), false),
);

/**
 * Classifies whether literal factory options declare an ID.
 * @param argument - Unevaluated options argument selected for this factory.
 * @returns A lazy effect yielding explicit, omitted, or unknown ID evidence.
 */
export const idPresenceEffect = Effect.fn("Discovery.idPresence")(
  function* (argument: ts.Expression | undefined): Generator<never, FactoryIdPresence, never> {
    const value = unwrap(argument);
    if (!value || !ts.isObjectLiteralExpression(value)) return "unknown";
    return value.properties.some((property) => propertyName(property.name) === "id")
      ? "explicit"
      : "omitted";
  },
  (effect, argument) => observeCompiler("discovery", "idPresence", effect, () => ({}), false),
);
