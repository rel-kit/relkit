import { Effect } from "effect";
import { makeGeneratorOperation } from "./generator-operation.js";

/** Readable source template for helpers embedded in generated REST clients. */
const runtimeHelperSource = `function joinUrl(baseUrl: string, path: string): string {
  return baseUrl.replace(/\\/+$/, "") + (path.startsWith("/") ? path : \`/\${path}\`);
}
function readPath(value: unknown, path: readonly string[]): unknown {
  let current = value;
  for (const key of path) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}
function setBodyValue(target: Record<string, unknown>, path: readonly string[], value: unknown): void {
  if (value === undefined || path.length === 0) return;
  let current = target;
  for (const key of path.slice(0, -1)) {
    const next = current[key]; current = (next && typeof next === "object" && !Array.isArray(next) ? next : (current[key] = {})) as Record<string, unknown>;
  }
  current[path[path.length - 1]!] = value;
}
function appendQuery(query: URLSearchParams, name: string, value: unknown): void {
  if (value === undefined) return;
  if (Array.isArray(value)) value.forEach((item) => query.append(name, String(item)));
  else query.append(name, String(value));
}
function setHeader(headers: Record<string, string>, name: string, value: unknown): void {
  if (value !== undefined) headers[name] = String(value);
}
function replacePathSegments(path: string, token: string, value: unknown): string {
  if ((value === undefined || (Array.isArray(value) && value.length === 0)) && token.endsWith("?")) return path.replace(\`/\${token}\`, "") || "/";
  if (!Array.isArray(value) || value.length === 0) throw new TypeError(\`Catch-all path "\${token}" needs at least one segment\`);
  return path.replace(token, value.map((segment) => encodeURIComponent(String(segment))).join("/"));
}
function appendCookie(cookies: string[], name: string, value: unknown): void {
  if (value !== undefined) cookies.push(\`\${name}=\${encodeURIComponent(String(value))}\`);
}
function appendFormValue(form: FormData, name: string, value: unknown): void {
  if (Array.isArray(value)) { value.forEach((item) => appendFormValue(form, name, item)); return; }
  if (value !== undefined) form.append(name, value instanceof Blob ? value : typeof value === "string" ? value : JSON.stringify(value));
}
async function request(fetcher: typeof globalThis.fetch, url: string, init: RequestInit): Promise<{ readonly status: number; readonly data: unknown }> {
  const response = await fetcher(url, init);
  const text = await response.text();
  let data: unknown;
  if (text !== "") { try { data = JSON.parse(text); } catch { data = text; } }
  return { status: response.status, data };
}`;

/** Renders request runtime helpers embedded in generated client source.
 * @returns An Effect yielding the fixed helper declarations; it has no expected failure.
 * @example Effect.runSync(runtimeHelpersCore());
 */
const runtimeHelpersCore = Effect.fnUntraced(function* () {
  return runtimeHelperSource.trimEnd().split("\n");
});
const runtimeHelpersOperation = makeGeneratorOperation("runtimeHelpers", runtimeHelpersCore);

/** Renders the runtime helper functions for generated REST methods in an observed Effect.
 * @returns An Effect with the generated value and no expected typed failures.
 * @example Effect.runSync(runtimeHelpersEffect());
 */
export const runtimeHelpersEffect = runtimeHelpersOperation.effect;

/** Renders the runtime helper functions for generated REST methods synchronously for existing callers.
 * @returns The generated value.
 * @throws If malformed trusted input causes a defect.
 * @example runtimeHelpers();
 */
export const runtimeHelpers = runtimeHelpersOperation.run;
