import { add } from "./normalize-pass-utils.js";
import { referenceFor } from "./normalize-reference-index.js";
import {
  mappingCompatible,
  mappingFields,
  schema,
  schemaEquivalent,
  schemaProperties,
} from "./normalize-compat.js";
import { isRecord, refId } from "./normalize-utils.js";
import {
  NORMALIZE_CODES,
  type NormalizedDescriptor,
  type NormalizationWork,
} from "./normalize-types.js";

/** Checks route inputs, responses, and function-backed middleware contracts. */
export function validateHttpCompatibility(work: NormalizationWork): void {
  for (const route of work.descriptors.filter((entry) => entry.kind === "route")) {
    const value = isRecord(route.value) ? route.value : {};
    const target = referenceFor(work, value.target, "function");
    const targetValue = isRecord(target?.value) ? target.value : undefined;
    const inputReason = mappingCompatible(value.request, targetValue?.input);
    if (inputReason !== undefined) add(work, route, NORMALIZE_CODES.mapping, inputReason);
    validateResponses(work, route, targetValue);
    validateRouteMiddleware(work, route, value.middleware);
  }
}

/** Canonicalizes path parameters so `/orders/:id` and `/orders/:orderId` collide. */
export function routeCollisionKey(value: unknown): string {
  if (!isRecord(value)) return " ";
  const method = typeof value.method === "string" ? value.method : "";
  const routePath = typeof value.path === "string" ? value.path : "";
  const pattern = routePath
    .split("/")
    .map((segment) => (segment.startsWith(":") ? ":" : segment))
    .join("/");
  return `${method} ${pattern}`;
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
      const declared = errors.find((error) => isRecord(error) && error.id === errorId);
      if (declared === undefined) {
        add(
          work,
          route,
          NORMALIZE_CODES.response,
          `Route response error "${errorId}" is not declared by its target.`,
        );
      } else if (
        response.schema !== undefined &&
        isRecord(declared) &&
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

function validateRouteMiddleware(
  work: NormalizationWork,
  route: NormalizedDescriptor,
  value: unknown,
): void {
  if (!Array.isArray(value)) return;
  const responses =
    isRecord(route.value) && Array.isArray(route.value.responses) ? route.value.responses : [];
  for (const entry of value) {
    const middlewareId = refId(entry);
    const middleware =
      middlewareId === undefined ? undefined : work.middlewareReferences.get(middlewareId);
    if (middleware === undefined) continue;
    const middlewareValue = isRecord(middleware.value) ? middleware.value : {};
    const target = referenceFor(work, middlewareValue.target, "function");
    const targetValue = isRecord(target?.value) ? target.value : undefined;
    const inputReason = mappingCompatible(middlewareValue.request, targetValue?.input);
    if (inputReason !== undefined)
      add(work, middleware, NORMALIZE_CODES.middlewareInput, inputReason);
    const decision = middlewareValue.decision;
    if (!isRecord(decision) || decision.kind !== "respond") continue;
    const response = findResponse(responses, decision.responseId);
    if (response === undefined) {
      add(
        work,
        middleware,
        NORMALIZE_CODES.response,
        `Middleware response "${String(decision.responseId)}" is not declared by the route.`,
      );
      continue;
    }
    if (
      response.schema !== undefined &&
      targetValue?.output !== undefined &&
      schema(response.schema).ok &&
      schema(targetValue.output).ok &&
      !schemaEquivalent(response.schema, targetValue.output)
    ) {
      add(
        work,
        middleware,
        NORMALIZE_CODES.middlewareOutput,
        `Middleware output does not match route response "${response.id}".`,
      );
    }
    if (decision.body !== undefined && response.schema !== undefined) {
      const fields = mappingFields(decision.body);
      const required = responseSchemaRequired(response.schema);
      const missing = required.filter((field) => !fields.includes(field));
      if (missing.length > 0)
        add(
          work,
          middleware,
          NORMALIZE_CODES.response,
          `Middleware response is missing fields: ${missing.join(", ")}.`,
        );
    }
  }
}

function findResponse(
  responses: readonly unknown[],
  id: unknown,
): Record<string, unknown> | undefined {
  return responses.find((response) => {
    if (!isRecord(response)) return false;
    return (
      response.id === id ||
      response.errorId === id ||
      (id === "validation" && response.kind === "validation-error")
    );
  }) as Record<string, unknown> | undefined;
}

function responseSchemaRequired(schema: unknown): readonly string[] {
  return schemaProperties(schema)?.required ?? [];
}
