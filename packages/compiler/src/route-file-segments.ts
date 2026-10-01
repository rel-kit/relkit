import { RouteFileError } from "./route-file-schema.js";
import { Effect } from "effect";
import { runCompilerSync } from "./compatibility.js";

import type { RouteFileSegment } from "./route-file.types.js";

/**
 * Parses a single conventional route filename segment.
 * @param value - Declared metadata inspected without coercion.
 * @returns A lazy effect yielding the parsed segment or rejecting with RouteFileError.
 */
export const parseSegmentEffect = Effect.fnUntraced(function* (
  value: string,
): Effect.fn.Return<RouteFileSegment, RouteFileError> {
  if (value === "" || value === "." || value === "..") return yield* invalidEffect(value);
  if (value.startsWith("@") || value.includes("(") || value.includes(")")) {
    return yield* new RouteFileError({
      cause: new TypeError(`Unsupported route segment "${value}"`),
    });
  }
  const optional = /^\[\[\.\.\.([^\]]+)\]\]$/.exec(value);
  if (optional !== null) return yield* namedEffect("optional-catch-all", optional[1] ?? "");
  const catchAll = /^\[\.\.\.([^\]]+)\]$/.exec(value);
  if (catchAll !== null) return yield* namedEffect("catch-all", catchAll[1] ?? "");
  const dynamic = /^\[([^\]]+)\]$/.exec(value);
  if (dynamic !== null) return yield* namedEffect("dynamic", dynamic[1] ?? "");
  if (value.includes("[") || value.includes("]")) return yield* invalidEffect(value);
  return { kind: "static", value };
});

/** Pure lexical compatibility leaf; throws RouteFileError for malformed syntax. */
export function parseSegment(value: string): RouteFileSegment {
  return runCompilerSync(parseSegmentEffect(value));
}

/**
 * Encodes a canonical route parameter as a filename segment.
 * @param value - Declared metadata inspected without coercion.
 * @returns A lazy effect yielding the filename segment or rejecting with RouteFileError.
 */
export const routePathSegmentToFileSegmentEffect = Effect.fnUntraced(function* (value: string) {
  if (value.startsWith(":")) return `[${value.slice(1)}]`;
  if (value.startsWith("*") && value.endsWith("?")) {
    return `[[...${value.slice(1, -1)}]]`;
  }
  if (value.startsWith("*")) return `[...${value.slice(1)}]`;
  if (value.includes(":") || value.includes("*")) {
    return yield* new RouteFileError({
      cause: new TypeError(`Malformed route path segment "${value}"`),
    });
  }
  return value;
});

/** Pure lexical compatibility leaf retaining RouteFileError rejection. */
export function routePathSegmentToFileSegment(value: string): string {
  return runCompilerSync(routePathSegmentToFileSegmentEffect(value));
}

/**
 * Validates and constructs a named route parameter segment.
 * @param kind - Descriptor or syntax category.
 * @param name - Declared binding or parameter name.
 * @returns A lazy effect yielding the named segment or rejecting with RouteFileError.
 */
const namedEffect = Effect.fnUntraced(function* (
  kind: "dynamic" | "catch-all" | "optional-catch-all",
  name: string,
): Effect.fn.Return<RouteFileSegment, RouteFileError> {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    return yield* new RouteFileError({
      cause: new TypeError(`Invalid route parameter name "${name}"`),
    });
  }
  return { kind, name };
});

/** Pure lexical constructor retaining the synchronous validation contract. */
export function named(
  kind: "dynamic" | "catch-all" | "optional-catch-all",
  name: string,
): RouteFileSegment {
  return runCompilerSync(namedEffect(kind, name));
}

/**
 * Rejects duplicate parameters and nonterminal catch-all segments.
 * @param segments - Parsed route path segments.
 * @returns A lazy validation effect rejecting duplicates or nonterminal parameters with RouteFileError.
 */
export const assertSegmentsEffect = Effect.fnUntraced(function* (
  segments: readonly RouteFileSegment[],
) {
  const names = new Set<string>();
  for (const [index, segment] of segments.entries()) {
    if (segment.kind === "static") continue;
    if (names.has(segment.name))
      return yield* new RouteFileError({
        cause: new TypeError(`Duplicate route parameter "${segment.name}"`),
      });
    names.add(segment.name);
    if (segment.kind !== "dynamic" && index !== segments.length - 1) {
      return yield* new RouteFileError({
        cause: new TypeError(
          `Catch-all route parameter "${segment.name}" must be the final segment`,
        ),
      });
    }
  }
});

/** Pure lexical validation boundary; rejects duplicate or nonterminal parameters. */
export function assertSegments(segments: readonly RouteFileSegment[]): void {
  return runCompilerSync(assertSegmentsEffect(segments));
}

/**
 * Renders parsed route segments in canonical or runtime syntax.
 * @param segments - Parsed route path segments.
 * @param mode - Canonical or runtime route rendering mode.
 * @returns The canonical or runtime path encoded from the parsed segments.
 */
export function pathFrom(
  segments: readonly RouteFileSegment[],
  mode: "canonical" | "runtime",
): string {
  if (segments.length === 0) return "/";
  return `/${segments
    .map((segment) => {
      if (segment.kind === "static") return segment.value;
      if (segment.kind === "dynamic") return `:${segment.name}`;
      if (mode === "runtime") return `:${segment.name}{.+}`;
      return segment.kind === "catch-all" ? `*${segment.name}` : `*${segment.name}?`;
    })
    .join("/")}`;
}

/**
 * Assigns the routing precedence rank for a segment variant.
 * @param segment - Parsed route segment whose precedence is inspected.
 * @returns The static, dynamic, catch-all, or optional catch-all precedence rank.
 */
export function segmentRank(segment: RouteFileSegment): 0 | 1 | 2 | 3 {
  if (segment.kind === "static") return 0;
  if (segment.kind === "dynamic") return 1;
  return segment.kind === "catch-all" ? 2 : 3;
}

/**
 * Rejects malformed route filename syntax.
 * @param value - Declared metadata inspected without coercion.
 * @returns Never; rejected input throws the documented validation error.
 */
export function invalid(value: string): never {
  throw new RouteFileError({ cause: new TypeError(`Malformed route segment "${value}"`) });
}

/** Pure syntax rejection effect; unknown conversion defects remain defects. */
const invalidEffect = (value: string) =>
  Effect.fail(new RouteFileError({ cause: new TypeError(`Malformed route segment "${value}"`) }));
