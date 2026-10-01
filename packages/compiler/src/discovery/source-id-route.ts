import { normalizeIdEffect } from "@relkit/contracts";
import { Effect } from "effect";
import { observeCompiler } from "../observability.js";
import { runDiscoverySync } from "./discovery-sync.js";
import { kebab } from "./source-id-helpers.js";

const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "ALL"]);

/**
 * Derives route identity from method and normalized path segments.
 * @param method - HTTP operation name, normalized case-insensitively.
 * @param routePath - Absolute route path with optional named/catch-all segments.
 * @param explicitId - Overrides route derivation when supplied.
 * @returns A lazy effect yielding identity or undefined for unsupported syntax; invalid IDs fail with StableIdError.
 */
export const encodeRouteIdEffect = Effect.fn("discovery.identity.route")(
  function* (method: string, routePath: string, explicitId?: unknown) {
    if (explicitId !== undefined) return yield* normalizeIdEffect(explicitId);
    const normalizedMethod = method.trim().toUpperCase();
    if (!HTTP_METHODS.has(normalizedMethod)) return undefined;
    const segments = yield* routeSegmentsEffect(routePath);
    if (segments === undefined) return undefined;
    return yield* normalizeIdEffect(
      ["route", normalizedMethod.toLowerCase(), ...segments].join("."),
    );
  },
  (effect) => observeCompiler("discovery", "encodeRouteId", effect, () => ({}), false),
);

/**
 * Synchronous route identity compatibility boundary.
 * @param method - HTTP operation name.
 * @param routePath - Absolute route path.
 * @param explicitId - Optional authoritative identity.
 * @returns The derived identity or undefined for unsupported syntax.
 * @throws StableIdError when the explicit or derived identity is invalid.
 */
export function encodeRouteId(
  method: string,
  routePath: string,
  explicitId?: unknown,
): string | undefined {
  return runDiscoverySync(encodeRouteIdEffect(method, routePath, explicitId));
}

/**
 * Normalizes route segments in order while rejecting unrepresentable parameters.
 * @param value - Absolute route path.
 * @returns A lazy effect yielding normalized identity segments or undefined.
 */
const routeSegmentsEffect = Effect.fn("discovery.identity.route-segments")(function* (
  value: string,
) {
  const normalized = value.trim().replaceAll("\\", "/");
  if (!normalized.startsWith("/")) return undefined;
  const raw = normalized.split("/").filter(Boolean);
  if (raw.length === 0) return ["root"];
  const result: string[] = [];
  for (const segment of raw) {
    const dynamic = /^:([A-Za-z_][A-Za-z0-9_]*)$/.exec(segment) ?? /^\{([^{}]+)\}$/.exec(segment);
    if (dynamic !== null) {
      const name = kebab(dynamic[1]);
      if (name === undefined) return undefined;
      result.push(`by-${name}`);
      continue;
    }
    const catchAll = /^(\*|\.\.\.)([A-Za-z_][A-Za-z0-9_]*)(\?)?$/.exec(segment);
    if (catchAll !== null) {
      const name = kebab(catchAll[2]);
      if (name === undefined) return undefined;
      result.push(catchAll[3] === "?" ? `optional-catch-all-${name}` : `catch-all-${name}`);
      continue;
    }
    const staticSegment = kebab(segment);
    if (staticSegment === undefined) return undefined;
    result.push(staticSegment);
  }
  return result;
});
