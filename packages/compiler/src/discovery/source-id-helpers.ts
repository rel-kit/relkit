import { normalizeIdEffect, normalizeSourcePathEffect } from "@relkit/contracts";
import { Effect } from "effect";
import { observeCompiler } from "../observability.js";
import type { SourceFactoryKind } from "./source-facts-types.js";
import type { KindRule } from "./source-id.types.js";

const KIND_RULES: Readonly<Record<SourceFactoryKind, KindRule>> = {
  app: { suffixes: ["relkit.config"] },
  function: { category: "functions", suffixes: ["function"] },
  service: { suffixes: ["service"] },
  route: { suffixes: ["route"] },
  task: { category: "tasks", suffixes: ["task"] },
  job: { category: "jobs", suffixes: ["job"] },
  event: { category: "events", suffixes: ["event"] },
  "event-trigger": { category: "events", suffixes: ["event"] },
  bucket: { category: "buckets", suffixes: ["bucket"] },
  cache: { category: "cache", suffixes: ["cache"] },
  tool: { category: "tools", suffixes: ["tool"] },
  agent: { category: "agents", suffixes: ["agent"] },
  channel: { category: "channels", suffixes: ["channel"] },
  constants: { category: "constants", suffixes: ["constants"] },
  prompt: { category: "prompts", suffixes: ["prompt"] },
  error: { category: "errors", suffixes: ["error"] },
  middleware: { category: "middleware", suffixes: ["middleware"] },
  transform: { category: "transforms", suffixes: ["transform"] },
};

/**
 * Derives source hierarchy by stripping conventional directories and filename suffixes.
 * @param source - Source path used as identity provenance.
 * @param kind - Descriptor category selecting conventional stripping rules.
 * @param projectRoot - Optional absolute root for absolute source paths.
 * @returns A lazy effect yielding normalized source hierarchy segments.
 */
export const sourcePartsEffect = Effect.fn("discovery.identity.source-parts")(
  function* (source: string, kind: SourceFactoryKind, projectRoot: string | undefined) {
    const normalized = yield* relativeSourceEffect(source, projectRoot);
    const parts = normalized.split("/").filter(Boolean);
    if (parts[0] === "src") parts.shift();
    const rule = KIND_RULES[kind];
    if (kind === "route" && parts[0] === "routes") parts.shift();
    if ((kind === "middleware" || kind === "transform") && parts[0] === "routes") {
      parts.shift();
      if (parts[0] === rule.category) parts.shift();
    } else if (kind !== "app" && kind !== "route" && kind !== "service") {
      if (parts[1] === rule.category) parts.splice(1, 1);
    }
    const last = parts.at(-1);
    if (last === undefined) return [];
    parts[parts.length - 1] = stripSuffix(last.replace(/\.(?:[cm]?[jt]sx?)$/i, ""), rule.suffixes);
    if (parts.at(-1) === "index") parts.pop();
    return parts.flatMap((part) => {
      const value = kebab(part);
      return value === undefined ? [] : [value];
    });
  },
  (effect) => observeCompiler("discovery", "sourceParts", effect, () => ({ files: 1 }), false),
);

/**
 * Retains legacy lexical identity derivation for paths without project provenance.
 * @param source - Candidate source path.
 * @param projectRoot - Optional project root used for portable normalization.
 * @returns A lazy effect yielding a portable or lexical fallback source string.
 * @remarks Only SourceLocationError permits this fallback; defects are not recovered.
 */
const relativeSourceEffect = Effect.fn("discovery.identity.relative-source")(function* (
  source: string,
  projectRoot: string | undefined,
) {
  return yield* normalizeSourcePathEffect(source, projectRoot).pipe(
    Effect.catchTag("SourceLocationError", () =>
      Effect.succeed(
        source
          .replaceAll("\\", "/")
          .replace(/^\/+/, "")
          .replace(/^\.\/+/, ""),
      ),
    ),
  );
});

/**
 * Joins source identity segments and validates the final stable identifier.
 * @param parts - Ordered source/member identity segments.
 * @returns A lazy effect yielding a stable identifier or undefined; malformed identities fail with StableIdError.
 */
export const finishEffect = Effect.fn("discovery.identity.finish")(
  function* (parts: readonly string[]) {
    const value = join(parts);
    return value === undefined ? undefined : yield* normalizeIdEffect(value);
  },
  (effect, parts) =>
    observeCompiler("discovery", "finish", effect, () => ({ entries: parts.length }), false),
);

/**
 * Removes one conventional suffix from a primitive filename stem.
 * @param value - Filename stem.
 * @param suffixes - Recognized conventional suffixes in priority order.
 * @returns The stripped stem; no domain validation or recovery occurs here.
 */
function stripSuffix(value: string, suffixes: readonly string[]): string {
  for (const suffix of suffixes) {
    if (value.endsWith(`.${suffix}`)) return value.slice(0, -suffix.length - 1);
    if (value === suffix) return "";
  }
  return value;
}

/**
 * Transforms a primitive token to lower-case kebab spelling.
 * @param value - Optional primitive spelling.
 * @returns A normalized token or undefined for an empty token; no ID validation occurs here.
 */
export function kebab(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value
    .normalize("NFKC")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
    .toLowerCase();
  return normalized === "" ? undefined : normalized;
}

/**
 * Joins nonempty primitive segments with the stable-ID separator.
 * @param parts - Ordered normalized segments.
 * @returns Their lexical join or undefined for no segments; validation belongs to finishEffect.
 */
export function join(parts: readonly string[]): string | undefined {
  const value = parts.filter((part) => part !== "").join(".");
  return value === "" ? undefined : value;
}
