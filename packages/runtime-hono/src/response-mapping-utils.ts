import type { HttpTriggerRegistration } from "@relkit/graph";
import type { StandardIssue, StandardSchemaV1 } from "@relkit/schema";
import type { RequestMappingIssue } from "./request-mapping.js";
import type { ResponseDeclaration, ResponseSchemaEntries } from "./response-mapping-utils.types.js";
export type { ResponseDeclaration, ResponseSchemaEntries } from "./response-mapping-utils.types.js";

/** Select an explicit response ID or the route's default success declaration.
 * @param trigger - Compiled HTTP trigger registration.
 * @param id - Optional event or declaration identifier.
 * @returns The matching success/response declaration when available.
 */
export function findSuccess(
  trigger: HttpTriggerRegistration,
  id: string | undefined,
): ResponseDeclaration | undefined {
  const values = responses(trigger);
  return id === undefined
    ? (values.find((entry) => entry.kind === "success") ??
        values.find((entry) => entry.kind === "response"))
    : findResponse(trigger, [id]);
}
/** Find a declared route error by its public error or response ID.
 * @param trigger - Compiled HTTP trigger registration.
 * @param id - Optional event or declaration identifier.
 * @returns The matching error declaration, or undefined.
 */
export function findError(
  trigger: HttpTriggerRegistration,
  id: string,
): ResponseDeclaration | undefined {
  return responses(trigger).find(
    (entry) => entry.kind === "error" && (entry.errorId === id || entry.id === id),
  );
}
/** Find the route's validation-error response declaration.
 * @param trigger - Compiled HTTP trigger registration.
 * @returns The declaration, or undefined when the route uses the fallback.
 */
export function findValidation(trigger: HttpTriggerRegistration): ResponseDeclaration | undefined {
  return responses(trigger).find((entry) => entry.kind === "validation-error");
}
/** Find the first response whose response or error ID is requested.
 * @param trigger - Compiled HTTP trigger registration.
 * @param ids - Candidate public response or error IDs.
 * @returns The matching declaration, or undefined.
 */
export function findResponse(
  trigger: HttpTriggerRegistration,
  ids: readonly string[],
): ResponseDeclaration | undefined {
  return responses(trigger).find(
    (entry) =>
      (typeof entry.id === "string" && ids.includes(entry.id)) ||
      (typeof entry.errorId === "string" && ids.includes(entry.errorId)),
  );
}
/** Resolve a declaration-local schema before scoped and unscoped manifest entries.
 * @param trigger - Compiled HTTP trigger registration.
 * @param declaration - Selected response declaration.
 * @param entries - Manifest schema entries keyed by response identity.
 * @returns The first supported Standard Schema descriptor.
 */
export function findSchema(
  trigger: HttpTriggerRegistration,
  declaration: ResponseDeclaration | undefined,
  entries: ResponseSchemaEntries | undefined,
): StandardSchemaV1 | undefined {
  const local = standardSchema(declaration?.schema);
  if (local !== undefined || entries === undefined || declaration === undefined) return local;
  for (const key of [`${trigger.id}:${String(declaration.id)}`, String(declaration.id)]) {
    const schema = standardSchema(
      entries instanceof Map
        ? entries.get(key)
        : (entries as Readonly<Record<string, unknown>>)[key],
    );
    if (schema !== undefined) return schema;
  }
  return undefined;
}
/** Use a declaration status when it falls in the HTTP status range.
 * @param declaration - Selected response declaration.
 * @param fallback - Status used when no supported declaration status exists.
 * @returns The declared status or the supplied fallback.
 */
export function responseStatus(
  declaration: ResponseDeclaration | undefined,
  fallback: number,
): number {
  return typeof declaration?.status === "number" &&
    declaration.status >= 100 &&
    declaration.status <= 599
    ? declaration.status
    : fallback;
}
/** Encode JSON output while omitting bodies for HTTP 204 and 304.
 * @param value - Value to validate or project.
 * @param status - HTTP response status.
 * @returns A JSON response, or a bodyless response when required by the status.
 */
export function jsonResponse(value: unknown, status: number): Response {
  if (status === 204 || status === 304) return new Response(null, { status });
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}
/** Encode a stable error ID as a JSON HTTP response.
 * @param error - Native failure or public error identifier.
 * @param status - HTTP response status.
 * @returns A response containing the error field and requested status.
 */
export function genericResponse(error: string, status: number): Response {
  return jsonResponse({ error }, status);
}
/** Bound issue messages and normalize field paths for public validation errors.
 * @param issue - Validation or mapping issue to sanitize.
 * @returns A safe code, message and frozen string/number path.
 */
export function safeIssue(issue: StandardIssue | RequestMappingIssue): {
  readonly code: string;
  readonly message: string;
  readonly path: readonly (string | number)[];
} {
  return {
    code: "code" in issue ? String(issue.code) : "validation",
    message: typeof issue.message === "string" ? issue.message.slice(0, 500) : "Invalid input",
    path: Object.freeze(
      (issue.path ?? []).map((part) => {
        const key = isRecord(part) && "key" in part ? part.key : part;
        return typeof key === "number" ? key : String(key);
      }),
    ),
  };
}
/** Read object response declarations from route configuration.
 * @param trigger - Compiled HTTP trigger registration.
 * @returns Supported response records, or an empty array.
 */
function responses(trigger: HttpTriggerRegistration): readonly ResponseDeclaration[] {
  return Array.isArray(trigger.config.responses) ? trigger.config.responses.filter(isRecord) : [];
}
/** Recognize a Standard Schema v1 descriptor with a callable validator.
 * @param value - Value to validate or project.
 * @returns The descriptor when valid, otherwise undefined.
 */
function standardSchema(value: unknown): StandardSchemaV1 | undefined {
  if (!isRecord(value) || !isRecord(value["~standard"])) return undefined;
  return value["~standard"].version === 1 && typeof value["~standard"].validate === "function"
    ? (value as unknown as StandardSchemaV1)
    : undefined;
}
/** Check whether a value is a non-null object suitable for field inspection.
 * @param value - Value to validate or project.
 * @returns Whether object fields can be inspected.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
