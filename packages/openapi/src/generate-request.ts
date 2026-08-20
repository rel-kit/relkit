import type { JsonValue } from "@zsys/contracts";
import type {
  OpenApiMediaType,
  OpenApiOperation,
  OpenApiParameter,
  OpenApiSchema,
} from "./generate.js";

type BodyEntry = {
  readonly kind: "body" | "multipart" | "multipart-all" | "whole-body";
  readonly name?: string;
  readonly schema: OpenApiSchema;
  readonly required: boolean;
};

export function buildRequest(
  mapping: JsonValue,
  root: JsonValue,
  routePath: string,
): { readonly parameters: OpenApiParameter[]; readonly body?: OpenApiOperation["requestBody"] } {
  const parameters: OpenApiParameter[] = [];
  const bodies: BodyEntry[] = [];
  collect(mapping, [], root, parameters, bodies, false, false);
  const routeNames = routeParameters(routePath);
  const declared = new Set(routeNames);
  const matching = parameters.filter((entry) => entry.in !== "path" || declared.has(entry.name));
  const parameterKeys = new Set(matching.map((entry) => `${entry.in}:${entry.name}`));
  for (const name of routeNames) {
    if (!parameterKeys.has(`path:${name}`))
      matching.push({ name, in: "path", required: true, schema: { type: "string" } });
  }
  matching.sort((left, right) =>
    `${left.in}:${left.name}`.localeCompare(`${right.in}:${right.name}`),
  );
  if (bodies.length === 0) return { parameters: matching };
  const groups = new Map<string, BodyEntry[]>();
  for (const entry of bodies) {
    const media = entry.kind.startsWith("multipart") ? "multipart/form-data" : "application/json";
    const group = groups.get(media) ?? [];
    group.push(entry);
    groups.set(media, group);
  }
  const content: Record<string, OpenApiMediaType> = {};
  let required = false;
  for (const [media, entries] of [...groups.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    required ||= entries.some((entry) => entry.required);
    const whole = entries.length === 1 && entries[0]?.kind === "whole-body";
    content[media] = { schema: whole ? entries[0]!.schema : objectSchema(entries) };
  }
  return { parameters: matching, body: { required, content } };
}

function collect(
  value: unknown,
  path: string[],
  root: JsonValue,
  parameters: OpenApiParameter[],
  bodies: BodyEntry[],
  optional: boolean,
  defaulted: boolean,
): void {
  if (!isRecord(value) || typeof value.kind !== "string") return;
  if ((value.kind === "input" || value.kind === "nested") && isRecord(value.fields)) {
    for (const [name, child] of Object.entries(value.fields))
      collect(child, [...path, name], root, parameters, bodies, optional, defaulted);
    return;
  }
  if (value.kind === "optional" || value.kind === "default" || value.kind === "transform") {
    collect(
      value.value,
      path,
      root,
      parameters,
      bodies,
      optional || value.kind === "optional",
      defaulted || value.kind === "default",
    );
    return;
  }
  const schema = schemaAt(root, path) ?? {};
  if (isParameterKind(value.kind)) {
    const name = typeof value.name === "string" ? value.name : (path.at(-1) ?? "value");
    parameters.push({
      name,
      in: value.kind === "path-segments" ? "path" : value.kind,
      required:
        value.kind === "path" || value.kind === "path-segments" || (!optional && !defaulted),
      schema: value.kind === "path-segments" ? { type: "string" } : schema,
    });
  } else if (
    value.kind === "body" ||
    value.kind === "multipart" ||
    value.kind === "multipart-all" ||
    value.kind === "whole-body"
  ) {
    bodies.push({
      kind: value.kind,
      ...(typeof value.name === "string" ? { name: value.name } : {}),
      schema,
      required: !optional && !defaulted,
    });
  }
}

function objectSchema(entries: readonly BodyEntry[]): OpenApiSchema {
  const properties: Record<string, JsonValue> = {};
  const required: string[] = [];
  for (const entry of [...entries].sort((left, right) =>
    String(left.name).localeCompare(String(right.name)),
  )) {
    if (entry.name === undefined) return entry.schema;
    properties[entry.name] = entry.schema;
    if (entry.required) required.push(entry.name);
  }
  return { type: "object", properties, ...(required.length === 0 ? {} : { required }) };
}

function schemaValue(value: unknown): OpenApiSchema | undefined {
  if (!isRecord(value)) return undefined;
  return value.$zsys === "schema" && isRecord(value.jsonSchema)
    ? (value.jsonSchema as OpenApiSchema)
    : (value as OpenApiSchema);
}

function schemaAt(root: JsonValue, path: readonly string[]): OpenApiSchema | undefined {
  let current = schemaValue(root);
  for (const name of path) {
    const properties = current?.properties;
    if (!isRecord(properties)) return undefined;
    current = schemaValue(properties[name]);
  }
  return current;
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

function isParameterKind(value: string): value is OpenApiParameter["in"] | "path-segments" {
  return ["path", "path-segments", "query", "header", "cookie"].includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
