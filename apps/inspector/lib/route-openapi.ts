import { collectRouteFields, type RouteField } from "./route-composer";
import { buildRouteResponses } from "./route-responses";

export function openApiOperation(
  route: Record<string, unknown>,
  target: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const config = record(route.config);
  const supplied = record(config?.openapi ?? route.openapi);
  if (supplied !== undefined) return supplied;
  const fields = collectRouteFields(config?.request, target?.input);
  const parameters = fields
    .filter((field) => ["path", "query", "header", "cookie"].includes(field.source))
    .map((field) => ({
      name: field.name ?? field.key,
      in: field.source,
      required: field.source === "path" || field.required,
      schema: field.schema ?? { type: "string" },
    }));
  for (const name of routeParameters(text(config?.path) || "/"))
    if (!parameters.some((parameter) => parameter.in === "path" && parameter.name === name))
      parameters.push({ name, in: "path", required: true, schema: { type: "string" } });
  parameters.sort((left, right) =>
    `${left.in}:${left.name}`.localeCompare(`${right.in}:${right.name}`),
  );
  const requestBody = buildRequestBody(fields, target?.input);
  return {
    operationId: text(route.id) || text(route.targetFunctionId) || "route",
    ...(parameters.length === 0 ? {} : { parameters }),
    ...(requestBody === undefined ? {} : { requestBody }),
    responses: buildRouteResponses(config?.responses, target),
    "x-relkit": {
      routeId: route.id,
      functionId: route.targetFunctionId,
      middleware: Array.isArray(config?.middleware) ? config.middleware : [],
      transforms: Array.isArray(config?.transforms)
        ? config.transforms.flatMap((value) => {
            const item = record(value);
            return item === undefined || typeof item.id !== "string" ? [] : [item.id];
          })
        : [],
    },
  };
}

function buildRequestBody(
  fields: readonly RouteField[],
  input: unknown,
): Record<string, unknown> | undefined {
  const bodyFields = fields.filter((field) =>
    ["body", "multipart", "whole-body"].includes(field.source),
  );
  if (bodyFields.length === 0) return undefined;
  const groups = new Map<string, RouteField[]>();
  for (const field of bodyFields) {
    const media = field.source === "multipart" ? "multipart/form-data" : "application/json";
    groups.set(media, [...(groups.get(media) ?? []), field]);
  }
  const content: Record<string, unknown> = {};
  for (const [media, entries] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const whole = entries.length === 1 && entries[0]?.source === "whole-body";
    content[media] = { schema: whole ? (schemaValue(input) ?? {}) : objectSchema(entries) };
  }
  return { required: bodyFields.some((field) => field.required), content };
}

function objectSchema(fields: readonly RouteField[]): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const field of [...fields].sort((a, b) =>
    (a.name ?? a.key).localeCompare(b.name ?? b.key),
  )) {
    const name = field.name ?? field.key;
    properties[name] = field.schema ?? {};
    if (field.required) required.push(name);
  }
  return { type: "object", properties, ...(required.length === 0 ? {} : { required }) };
}

function routeParameters(path: string): readonly string[] {
  return path.split("/").flatMap((segment, index) => {
    if (segment.startsWith(":")) return [parameterName(segment.slice(1), index)];
    return segment.startsWith("*") ? [parameterName(segment.slice(1), index, "wildcard")] : [];
  });
}

function parameterName(value: string, index: number, fallback = "param"): string {
  const result = value.replace(/[^A-Za-z0-9_.-]/g, "_");
  return result || `${fallback}${index}`;
}

function schemaValue(value: unknown): Record<string, unknown> | undefined {
  const recordValue = record(value);
  if (recordValue?.$relkit === "schema") return record(recordValue.jsonSchema);
  return recordValue;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
