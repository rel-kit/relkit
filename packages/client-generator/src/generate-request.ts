import { canonicalJson } from "@zsys/contracts";
import type { ClientRoute, MappingLeaf } from "./generate-types.js";

export interface RouteMethodNames {
  readonly method: string;
  readonly type: string;
}

export function routeMethod(route: ClientRoute, names: RouteMethodNames): string[] {
  const optional = acceptsMissingInput(route);
  const lines = [
    `    async ${names.method}(input${optional ? `: ${names.type}Input = {} as ${names.type}Input` : `: ${names.type}Input`}) {`,
    `      let path = ${JSON.stringify(route.trigger.config.path)};`,
  ];
  lines.push(...pathStatements(route));
  lines.push(
    "      const query = new URLSearchParams();",
    ...queryStatements(route),
    "      const queryString = query.toString();",
    '      const url = joinUrl(baseUrl, path) + (queryString === "" ? "" : `?${queryString}`);',
    "      const headers: Record<string, string> = {};",
    ...headerStatements(route),
    ...bodyStatements(route),
    `      const result = await request(fetcher, url, { method: ${JSON.stringify(route.trigger.config.method)}, headers, ...(${hasBody(route) ? "requestBody === undefined ? {} : { body: requestBody }" : "{}"}) });`,
    `      return result as ${names.type}Result;`,
    "    },",
  );
  return lines;
}

export function acceptsMissingInput(route: ClientRoute): boolean {
  return route.fields.every(
    (field) => field.kind === "constant" || field.optional || field.defaulted,
  );
}

export function runtimeHelpers(): string[] {
  return [
    "function joinUrl(baseUrl: string, path: string): string {",
    '  return baseUrl.replace(/\\/+$/, "") + (path.startsWith("/") ? path : `/${path}`);',
    "}",
    "function readPath(value: unknown, path: readonly string[]): unknown {",
    "  let current = value;",
    "  for (const key of path) {",
    '    if (current === null || typeof current !== "object") return undefined;',
    "    current = (current as Record<string, unknown>)[key];",
    "  }",
    "  return current;",
    "}",
    "function setBodyValue(target: Record<string, unknown>, path: readonly string[], value: unknown): void {",
    "  if (value === undefined || path.length === 0) return;",
    "  let current = target;",
    "  for (const key of path.slice(0, -1)) {",
    '    const next = current[key]; current = (next && typeof next === "object" && !Array.isArray(next) ? next : (current[key] = {})) as Record<string, unknown>;',
    "  }",
    "  current[path[path.length - 1]!] = value;",
    "}",
    "function appendQuery(query: URLSearchParams, name: string, value: unknown): void {",
    "  if (value === undefined) return;",
    "  if (Array.isArray(value)) value.forEach((item) => query.append(name, String(item)));",
    "  else query.append(name, String(value));",
    "}",
    "function setHeader(headers: Record<string, string>, name: string, value: unknown): void {",
    "  if (value !== undefined) headers[name] = String(value);",
    "}",
    "function replacePathSegments(path: string, token: string, value: unknown): string {",
    '  if ((value === undefined || (Array.isArray(value) && value.length === 0)) && token.endsWith("?")) return path.replace(`/\${token}`, "") || "/";',
    '  if (!Array.isArray(value) || value.length === 0) throw new TypeError(`Catch-all path "${token}" needs at least one segment`);',
    '  return path.replace(token, value.map((segment) => encodeURIComponent(String(segment))).join("/"));',
    "}",
    "function appendCookie(cookies: string[], name: string, value: unknown): void {",
    "  if (value !== undefined) cookies.push(`${name}=${encodeURIComponent(String(value))}`);",
    "}",
    "function appendFormValue(form: FormData, name: string, value: unknown): void {",
    "  if (Array.isArray(value)) { value.forEach((item) => appendFormValue(form, name, item)); return; }",
    '  if (value !== undefined) form.append(name, value instanceof Blob ? value : typeof value === "string" ? value : JSON.stringify(value));',
    "}",
    "async function request(fetcher: typeof globalThis.fetch, url: string, init: RequestInit): Promise<{ readonly status: number; readonly data: unknown }> {",
    "  const response = await fetcher(url, init);",
    "  const text = await response.text();",
    "  let data: unknown;",
    '  if (text !== "") { try { data = JSON.parse(text); } catch { data = text; } }',
    "  return { status: response.status, data };",
    "}",
  ];
}

function pathStatements(route: ClientRoute): string[] {
  return route.trigger.config.path.split("/").flatMap((segment) => {
    if (!segment.startsWith(":") && !segment.startsWith("*")) return [];
    const name = segment.slice(1).replace(/\?$/, "");
    const kind = segment.startsWith("*") ? "path-segments" : "path";
    const field = route.fields.find((entry) => entry.kind === kind && entry.name === name);
    const path = field?.inputPath ?? [name];
    if (kind === "path-segments") {
      return [
        `      path = replacePathSegments(path, ${JSON.stringify(segment)}, readPath(input, ${canonicalJson(path)}));`,
      ];
    }
    return [
      `      path = path.replace(${JSON.stringify(segment)}, encodeURIComponent(String(readPath(input, ${canonicalJson(path)}))));`,
    ];
  });
}

function queryStatements(route: ClientRoute): string[] {
  return route.fields
    .filter((field) => field.kind === "query")
    .map((field, index) => {
      const path = canonicalJson(field.inputPath);
      const name = JSON.stringify(field.name ?? field.outputPath.at(-1) ?? `query${index}`);
      return `      appendQuery(query, ${name}, readPath(input, ${path}));`;
    });
}

function headerStatements(route: ClientRoute): string[] {
  const headers = route.fields.filter((field) => field.kind === "header");
  const cookies = route.fields.filter((field) => field.kind === "cookie");
  const lines = headers.map(
    (field, index) =>
      `      setHeader(headers, ${JSON.stringify(field.name ?? `header${index}`)}, readPath(input, ${canonicalJson(field.inputPath)}));`,
  );
  if (cookies.length > 0) {
    lines.push("      const cookies: string[] = [];");
    for (const [index, field] of cookies.entries())
      lines.push(
        `      appendCookie(cookies, ${JSON.stringify(field.name ?? `cookie${index}`)}, readPath(input, ${canonicalJson(field.inputPath)}));`,
      );
    lines.push('      if (cookies.length > 0) headers.cookie = cookies.join("; ");');
  }
  return lines;
}

function bodyStatements(route: ClientRoute): string[] {
  if (!hasBody(route)) return [];
  const fields = route.fields.filter(isBody);
  const lines = ["      let requestBody: string | FormData | undefined;"];
  const whole = fields.filter((field) => field.kind === "whole-body");
  if (whole.length === 1 && fields.length === 1) {
    lines.push(
      `      const wholeBody = readPath(input, ${canonicalJson(whole[0]!.inputPath)});`,
      "      if (wholeBody !== undefined) requestBody = JSON.stringify(wholeBody);",
    );
    return lines;
  }
  if (fields.some((field) => field.kind === "multipart" || field.kind === "multipart-all")) {
    lines.push("      const form = new FormData();");
    for (const [index, field] of fields.entries()) {
      const value =
        field.kind === "constant"
          ? literal(field.value)
          : `readPath(input, ${canonicalJson(field.inputPath)})`;
      lines.push(
        `      appendFormValue(form, ${JSON.stringify(field.name ?? field.outputPath.at(-1) ?? `field${index}`)}, ${value});`,
      );
    }
    lines.push("      requestBody = form;");
    return lines;
  }
  lines.push("      const payload: Record<string, unknown> = {};");
  for (const field of fields) {
    const value =
      field.kind === "constant"
        ? literal(field.value)
        : `readPath(input, ${canonicalJson(field.inputPath)})`;
    lines.push(`      setBodyValue(payload, ${canonicalJson(field.outputPath)}, ${value});`);
  }
  lines.push(
    '      headers["content-type"] = "application/json";',
    "      requestBody = JSON.stringify(payload);",
  );
  return lines;
}

function hasBody(route: ClientRoute): boolean {
  return route.fields.some(isBody);
}

function isBody(field: MappingLeaf): boolean {
  return ["body", "whole-body", "multipart", "multipart-all", "constant"].includes(field.kind);
}

function literal(value: unknown): string {
  return canonicalJson(value);
}
