export type RouteSource =
  "path" | "query" | "header" | "cookie" | "body" | "multipart" | "whole-body";

export interface RouteField {
  readonly key: string;
  readonly source: RouteSource;
  readonly name?: string;
  readonly required: boolean;
  readonly defaultValue?: unknown;
  readonly schema?: Record<string, unknown>;
}

export interface RouteRequestDefinition {
  readonly method: string;
  readonly path: string;
  readonly request?: unknown;
  readonly inputSchema?: unknown;
}

export interface RouteFieldError {
  readonly key: string;
  readonly message: string;
}

export interface ComposedRouteRequest {
  readonly ok: boolean;
  readonly path?: string;
  readonly init?: RequestInit;
  readonly errors: readonly RouteFieldError[];
}

export function collectRouteFields(mapping: unknown, inputSchema?: unknown): readonly RouteField[] {
  return collect(mapping, [], true, undefined, schemaRecord(inputSchema));
}

export function composeRouteRequest(
  route: RouteRequestDefinition,
  values: Readonly<Record<string, unknown>>,
): ComposedRouteRequest {
  const fields = collectRouteFields(route.request, route.inputSchema);
  const errors: RouteFieldError[] = [];
  let path = route.path;
  const query = new URLSearchParams();
  const headers = new Headers({ accept: "application/json" });
  let body: Record<string, unknown> | undefined;
  let rawBody: unknown;
  let multipart: FormData | undefined;

  for (const field of fields) {
    const value = valueFor(field, values, errors);
    if (value === undefined) continue;
    const converted = convertValue(value, field, errors);
    if (converted === undefined) continue;
    if (field.source === "path") {
      path = path.replace(`:${field.name ?? ""}`, encodeURIComponent(String(converted)));
      path = path.replace(`*${field.name ?? ""}`, encodeURIComponent(String(converted)));
    } else if (field.source === "query") query.set(field.name ?? field.key, String(converted));
    else if (field.source === "header") headers.set(field.name ?? field.key, String(converted));
    else if (field.source === "cookie") headers.set("cookie", `${field.name}=${String(converted)}`);
    else if (field.source === "whole-body") rawBody = converted;
    else if (field.source === "multipart") {
      multipart ??= new FormData();
      multipart.append(field.name ?? field.key, formValue(converted));
    } else {
      body ??= {};
      setPath(body, [field.name ?? field.key], converted);
    }
  }

  if (errors.length > 0) return { ok: false, errors: Object.freeze(errors) };
  const encodedQuery = query.toString();
  const resultPath = encodedQuery === "" ? path : `${path}?${encodedQuery}`;
  const init: RequestInit = { method: route.method.toUpperCase(), headers };
  const requestBody = rawBody ?? body;
  if (
    multipart !== undefined &&
    requestBody === undefined &&
    !["GET", "HEAD"].includes(init.method ?? "")
  ) {
    init.body = multipart;
  } else if (requestBody !== undefined && !["GET", "HEAD"].includes(init.method ?? "")) {
    headers.set("content-type", "application/json");
    init.body = JSON.stringify(requestBody);
  }
  return { ok: true, path: resultPath, init, errors: [] };
}

function collect(
  node: unknown,
  prefix: readonly string[],
  required: boolean,
  defaultValue: unknown,
  schema: Record<string, unknown> | undefined,
): RouteField[] {
  const value = record(node);
  if (value === undefined || typeof value.kind !== "string") return [];
  if (value.kind === "optional") return collect(value.value, prefix, false, defaultValue, schema);
  if (value.kind === "default") return collect(value.value, prefix, false, value.default, schema);
  if (value.kind === "transform")
    return collect(value.value, prefix, required, defaultValue, schema);
  if (value.kind === "input" || value.kind === "nested") {
    const fields = record(value.fields);
    if (fields === undefined) return [];
    return Object.entries(fields).flatMap(([key, child]) =>
      collect(child, [...prefix, key], required, defaultValue, schemaProperty(schema, key)),
    );
  }
  if (value.kind === "constant") return [];
  if (!isSource(value.kind)) return [];
  const name = text(value.name);
  const key = prefix.join(".") || name || "body";
  return [
    {
      key,
      source: value.kind,
      ...(name === undefined ? {} : { name }),
      required,
      ...(defaultValue === undefined ? {} : { defaultValue }),
      ...(schema === undefined ? {} : { schema }),
    },
  ];
}

function valueFor(
  field: RouteField,
  values: Readonly<Record<string, unknown>>,
  errors: RouteFieldError[],
): unknown {
  const raw = values[field.key];
  if (raw === undefined || raw === "") {
    if (field.defaultValue !== undefined) return field.defaultValue;
    if (field.required) errors.push({ key: field.key, message: "This value is required." });
    return undefined;
  }
  return raw;
}

function convertValue(value: unknown, field: RouteField, errors: RouteFieldError[]): unknown {
  const type = text(field.schema?.type);
  if (typeof value !== "string") return value;
  if (type === "number" || type === "integer") {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || (type === "integer" && !Number.isInteger(parsed))) {
      errors.push({ key: field.key, message: `Expected a ${type}.` });
      return undefined;
    }
    return parsed;
  }
  if (type === "boolean") return value === "true" || value === "on";
  if (type === "object" || type === "array") {
    try {
      return JSON.parse(value);
    } catch {
      errors.push({ key: field.key, message: "Enter valid JSON." });
    }
  }
  return value;
}

function setPath(target: Record<string, unknown>, path: readonly string[], value: unknown): void {
  let current = target;
  for (const part of path.slice(0, -1)) {
    const next = record(current[part]) ?? {};
    current[part] = next;
    current = next;
  }
  const last = path.at(-1);
  if (last !== undefined) current[last] = value;
}

function formValue(value: unknown): string | Blob {
  if (value instanceof Blob) return value;
  if (typeof value === "string") return value;
  return JSON.stringify(value) ?? String(value);
}

function schemaRecord(value: unknown): Record<string, unknown> | undefined {
  return record(value);
}
function schemaProperty(
  schema: Record<string, unknown> | undefined,
  key: string,
): Record<string, unknown> | undefined {
  const properties = record(schema?.properties);
  return record(properties?.[key]);
}
function isSource(value: string): value is RouteSource {
  return ["path", "query", "header", "cookie", "body", "multipart", "whole-body"].includes(value);
}
function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}
