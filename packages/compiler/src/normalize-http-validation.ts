import { Effect } from "effect";
import { runCompilerSync } from "./compatibility.js";
import { observeCompiler } from "./observability.js";
import { add } from "./normalize-pass-utils.js";
import { referenceFor } from "./normalize-reference-index.js";
import {
  mappingCompatibleEffect,
  schemaEffect,
  schemaEquivalentEffect,
} from "./normalize-compat.js";
import { isErrorDescriptorLike, isRecord } from "./normalize-utils.js";
import {
  NORMALIZE_CODES,
  type NormalizedDescriptor,
  type NormalizationWork,
} from "./normalize-types.js";
const RESERVED_ROUTE_MESSAGE = 'Routes under "/_relkit" are framework-reserved.';

/**
 * Checks route request mappings and response schemas against target functions.
 * @param work - Invocation-owned descriptors, indexes, and diagnostics.
 * @returns A lazy effect yielding the checked result; findings append to the workspace diagnostics.
 * @remarks Unexpected metadata access failures remain defects.
 * @see {@link normalizeCompilationEffect} for ordered stage composition.
 */
export const validateHttpCompatibilityEffect = Effect.fn("Compiler.validateHttpCompatibility")(
  function* (work: NormalizationWork) {
    yield* Effect.forEach(
      work.descriptors.filter((entry) => entry.kind === "route"),
      (route) =>
        Effect.gen(function* () {
          const value = isRecord(route.value) ? route.value : {};
          const path = typeof value.path === "string" ? value.path : "";
          if (path === "/_relkit" || path.startsWith("/_relkit/"))
            add(work, route, NORMALIZE_CODES.reservedRoute, RESERVED_ROUTE_MESSAGE);
          if (value.raw === true) return;
          const target = referenceFor(work, value.target, "function");
          const targetValue = isRecord(target?.value) ? target.value : undefined;
          const inputReason = yield* mappingCompatibleEffect(value.request, targetValue?.input);
          if (inputReason !== undefined) add(work, route, NORMALIZE_CODES.mapping, inputReason);
          yield* validateResponsesEffect(work, route, targetValue);
        }),
      { discard: true },
    );
  },
  (effect, work) =>
    observeCompiler("normalization", "validateHttpCompatibility", effect, () => ({
      descriptors: work.descriptors.length,
      diagnostics: work.diagnostics.length,
    })),
);

/**
 * Checks route request mappings and response schemas against target functions.
 * @param work - Invocation-owned descriptors, indexes, and diagnostics.
 * @returns The checked result after executing the Effect at the compatibility boundary.
 * @remarks Unexpected metadata access failures remain defects.
 * @see {@link normalizeCompilationEffect} for ordered stage composition.
 */
export function validateHttpCompatibility(work: NormalizationWork): void {
  return runCompilerSync(validateHttpCompatibilityEffect(work));
}

/**
 * Canonicalizes path parameters so `/orders/:id` and `/orders/:orderId` collide.
 * @param value - Declared metadata inspected without coercion.
 * @returns A method/path collision key with parameter names removed.
 */
export function routeCollisionKey(value: unknown): string {
  return routeCollisionKeys(value)[0] ?? " ";
}

/**
 * Returns every normalized runtime method/path variant for collision checks.
 * @param value - Declared metadata inspected without coercion.
 * @returns Collision keys for every runtime method/path variant.
 */
export function routeCollisionKeys(value: unknown): readonly string[] {
  if (!isRecord(value)) return [" "];
  const method = typeof value.method === "string" ? value.method : "";
  const routePaths = Array.isArray(value.runtimePaths)
    ? value.runtimePaths.filter((entry): entry is string => typeof entry === "string")
    : [typeof value.path === "string" ? value.path : ""];
  return [
    ...new Set(routePaths.map((routePath) => `${method} ${normalizeRuntimePath(routePath)}`)),
  ];
}

/**
 * Removes parameter spelling while retaining wildcard specificity.
 * @param routePath - Canonical HTTP route path.
 * @returns A runtime path retaining wildcard specificity but omitting parameter names.
 */
function normalizeRuntimePath(routePath: string): string {
  const pattern = routePath
    .split("/")
    .map((segment) => {
      if (/^:[^{]+\{\.\+\}$/.test(segment) || segment.startsWith("*")) return ":*";
      return segment.startsWith(":") ? ":" : segment;
    })
    .join("/");
  return pattern;
}

/**
 * Checks response identities and schemas against declared target outputs and errors.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @param route - Route descriptor being checked or projected.
 * @param target - Target contract or metadata being checked.
 * @returns A lazy effect that checks response identities and schemas against declared target outputs and errors; unexpected access failures remain defects.
 */
const validateResponsesEffect = Effect.fn("Compiler.validateResponses")(function* (
  work: NormalizationWork,
  route: NormalizedDescriptor,
  target: Record<string, unknown> | undefined,
) {
  const responses =
    isRecord(route.value) && Array.isArray(route.value.responses) ? route.value.responses : [];
  const seen = new Set<string>();
  yield* Effect.forEach(
    responses,
    (response) =>
      Effect.gen(function* () {
        if (!isRecord(response)) return;
        const responseId = typeof response.id === "string" ? response.id : "";
        if (seen.has(responseId))
          add(work, route, NORMALIZE_CODES.response, `Route response "${responseId}" is repeated.`);
        seen.add(responseId);
        if (response.kind === "error") {
          const errorId = typeof response.errorId === "string" ? response.errorId : "";
          const errors = Array.isArray(target?.errors) ? target.errors : [];
          const declared = errors.find(
            (error) => isErrorDescriptorLike(error) && error.id === errorId,
          );
          if (declared === undefined) {
            add(
              work,
              route,
              NORMALIZE_CODES.response,
              `Route response error "${errorId}" is not declared by its target.`,
            );
          } else if (
            response.schema !== undefined &&
            isErrorDescriptorLike(declared) &&
            (yield* schemaEffect(response.schema)).ok &&
            (yield* schemaEffect(declared.data)).ok &&
            !(yield* schemaEquivalentEffect(response.schema, declared.data))
          ) {
            add(
              work,
              route,
              NORMALIZE_CODES.response,
              `Route response "${responseId}" does not match its declared error schema.`,
            );
          }
        } else if (
          response.schema !== undefined &&
          (response.kind === "success" || response.kind === "response") &&
          target?.output !== undefined &&
          (yield* schemaEffect(response.schema)).ok &&
          (yield* schemaEffect(target.output)).ok &&
          !(yield* schemaEquivalentEffect(response.schema, target.output))
        ) {
          add(
            work,
            route,
            NORMALIZE_CODES.response,
            `Route response "${responseId}" does not match target output.`,
          );
        }
      }),
    { discard: true },
  );
});
