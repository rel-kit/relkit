import * as ts from "typescript";
import { Effect } from "effect";
import type { ExportFact, LocalBinding } from "./source-facts.types.js";

const ROUTE_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "ALL"]);

/**
 * Projects trusted local evidence into an export record.
 * @param local - Declaration evidence already collected by the owning Effect.
 * @returns A lazy effect yielding evidence sharing the declaration's identity and offset.
 */
export const exportFactEffect = Effect.fn("Discovery.exportFact")(function* (
  local: LocalBinding,
): Generator<never, ExportFact, never> {
  return {
    position: local.position,
    binding: local.binding,
    ...(local.factory === undefined ? {} : { factory: local.factory }),
    ...(local.error === undefined ? {} : { errorBinding: local.error }),
  };
});

/**
 * Recognizes a runtime export's HTTP method spelling.
 * @param value - Export name to compare case-insensitively.
 * @returns A lazy effect yielding the supported method or undefined for other names.
 */
export const routeMethodEffect = Effect.fn("Discovery.routeMethod")(function* (value: string) {
  const method = value.toUpperCase();
  return ROUTE_METHODS.has(method) ? method : undefined;
});

/**
 * Copies trusted evidence into ascending character-offset order.
 * @typeParam T - Evidence retaining a source character offset.
 * @param values - Evidence to order without changing the supplied array.
 * @returns A sorted copy, preserving order for equal offsets.
 */
export function sortFacts<T extends { readonly position: number }>(values: readonly T[]): T[] {
  return [...values].sort((left, right) => left.position - right.position);
}

/**
 * Checks a TypeScript node for one modifier kind.
 * @param node - Parsed node whose modifiers are inspected.
 * @param kind - TypeScript modifier kind to recognize.
 * @returns Whether the node carries that modifier.
 */
export function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return (
    ts.canHaveModifiers(node) &&
    ts.getModifiers(node)?.some((modifier) => modifier.kind === kind) === true
  );
}
