import { add } from "./normalize-pass-utils.js";
import { referenceFor } from "./normalize-reference-index.js";
import { mappingCompatible, schema, schemaEquivalent } from "./normalize-compat.js";
import { isErrorDescriptorLike, isRecord } from "./normalize-utils.js";
import {
  NORMALIZE_CODES,
  type NormalizedDescriptor,
  type NormalizationWork,
} from "./normalize-types.js";
const RESERVED_ROUTE_MESSAGE = 'Routes under "/_relkit" are framework-reserved.';

/** Checks route inputs, responses, and function-backed middleware contracts. */
export function validateHttpCompatibility(work: NormalizationWork): void {
  for (const route of work.descriptors.filter((entry) => entry.kind === "route")) {
    const value = isRecord(route.value) ? route.value : {};
    const path = typeof value.path === "string" ? value.path : "";
    if (path === "/_relkit" || path.startsWith("/_relkit/"))
      add(work, route, NORMALIZE_CODES.reservedRoute, RESERVED_ROUTE_MESSAGE);
    if (value.raw === true) continue;
    const target = referenceFor(work, value.target, "function");
    const targetValue = isRecord(target?.value) ? target.value : undefined;
    const inputReason = mappingCompatible(value.request, targetValue?.input);
    if (inputReason !== undefined) add(work, route, NORMALIZE_CODES.mapping, inputReason);
    validateResponses(work, route, targetValue);
  }
}

/** Canonicalizes path parameters so `/orders/:id` and `/orders/:orderId` collide. */
export function routeCollisionKey(value: unknown): string {
  return routeCollisionKeys(value)[0] ?? " ";
}

/** Returns every normalized runtime method/path variant for collision checks. */
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

function validateResponses(
  work: NormalizationWork,
  route: NormalizedDescriptor,
  target: Record<string, unknown> | undefined,
): void {
  const responses =
    isRecord(route.value) && Array.isArray(route.value.responses) ? route.value.responses : [];
  const seen = new Set<string>();
  for (const response of responses) {
    if (!isRecord(response)) continue;
    const responseId = typeof response.id === "string" ? response.id : "";
    if (seen.has(responseId))
      add(work, route, NORMALIZE_CODES.response, `Route response "${responseId}" is repeated.`);
    seen.add(responseId);
    if (response.kind === "error") {
      const errorId = typeof response.errorId === "string" ? response.errorId : "";
      const errors = Array.isArray(target?.errors) ? target.errors : [];
      const declared = errors.find((error) => isErrorDescriptorLike(error) && error.id === errorId);
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
        schema(response.schema).ok &&
        schema(declared.data).ok &&
        !schemaEquivalent(response.schema, declared.data)
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
      schema(response.schema).ok &&
      schema(target.output).ok &&
      !schemaEquivalent(response.schema, target.output)
    ) {
      add(
        work,
        route,
        NORMALIZE_CODES.response,
        `Route response "${responseId}" does not match target output.`,
      );
    }
  }
}
