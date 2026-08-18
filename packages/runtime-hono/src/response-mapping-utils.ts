import type { HttpTriggerRegistration } from "@zsys/graph";
import type { StandardIssue, StandardSchemaV1 } from "@zsys/schema";
import type { RequestMappingIssue } from "./request-mapping.js";

export type ResponseSchemaEntries =
  Readonly<Record<string, unknown>> | ReadonlyMap<string, unknown>;
export type ResponseDeclaration = Record<string, unknown>;

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
export function findError(
  trigger: HttpTriggerRegistration,
  id: string,
): ResponseDeclaration | undefined {
  return responses(trigger).find(
    (entry) => entry.kind === "error" && (entry.errorId === id || entry.id === id),
  );
}
export function findValidation(trigger: HttpTriggerRegistration): ResponseDeclaration | undefined {
  return responses(trigger).find((entry) => entry.kind === "validation-error");
}
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
export function jsonResponse(value: unknown, status: number): Response {
  if (status === 204 || status === 304) return new Response(null, { status });
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}
export function genericResponse(error: string, status: number): Response {
  return jsonResponse({ error }, status);
}
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
function responses(trigger: HttpTriggerRegistration): readonly ResponseDeclaration[] {
  return Array.isArray(trigger.config.responses) ? trigger.config.responses.filter(isRecord) : [];
}
function standardSchema(value: unknown): StandardSchemaV1 | undefined {
  if (!isRecord(value) || !isRecord(value["~standard"])) return undefined;
  return value["~standard"].version === 1 && typeof value["~standard"].validate === "function"
    ? (value as unknown as StandardSchemaV1)
    : undefined;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
