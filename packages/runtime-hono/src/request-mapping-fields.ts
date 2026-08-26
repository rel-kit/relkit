import { MISSING, parseForm, parseJson, type Missing } from "./request-mapping-body.js";
import type { MappingState } from "./request-mapping-object.js";
import type { RequestIssueCode, RequestMappingFailure } from "./request-mapping.js";

export async function bodyField(
  name: string,
  state: MappingState,
  path: readonly (string | number)[],
): Promise<unknown | Missing> {
  const validated = validatedTarget(state, "json");
  if (isRecord(validated) && Object.hasOwn(validated, name)) return validated[name];
  const value = await jsonValue(state, path);
  return value !== MISSING && isRecord(value) && Object.hasOwn(value, name) ? value[name] : MISSING;
}

export async function jsonValue(
  state: MappingState,
  path: readonly (string | number)[],
): Promise<unknown | Missing> {
  const validated = validatedTarget(state, "json");
  if (validated !== undefined) return validated;
  const result = await parseJson(state.body);
  if (result.issue !== undefined)
    addMappingIssue(state, result.issue.code, result.issue.message, path);
  return result.value;
}

export function validatedSource(state: MappingState, target: string, name: string) {
  const validated = validatedTarget(state, target);
  return isRecord(validated) && Object.hasOwn(validated, name)
    ? { found: true, value: validated[name] }
    : { found: false };
}

export async function formField(
  name: string,
  state: MappingState,
  path: readonly (string | number)[],
  all: boolean,
): Promise<unknown | Missing> {
  const validated = validatedTarget(state, "form");
  if (isRecord(validated) && Object.hasOwn(validated, name)) return validated[name];
  if (isFormDataLike(validated)) {
    const values = validated.getAll(name);
    return all ? (values.length === 0 ? MISSING : values) : (values[0] ?? MISSING);
  }
  const result = await parseForm(state.body);
  if (result.issue !== undefined)
    addMappingIssue(state, result.issue.code, result.issue.message, path);
  if (result.value === MISSING) return MISSING;
  const values = result.value.getAll(name);
  if (all) return values.length === 0 ? MISSING : Object.freeze([...values]);
  if (values.length > 1)
    addMappingIssue(state, "duplicate", `Duplicate multipart field "${name}"`, path);
  return values.length === 1 ? values[0] : MISSING;
}

export function mappingFailure(state: MappingState): RequestMappingFailure {
  return { ok: false, issues: Object.freeze(state.issues.map((item) => Object.freeze(item))) };
}

export function addMappingIssue(
  state: MappingState,
  code: RequestIssueCode,
  message: string,
  path: readonly (string | number)[],
): void {
  const key = `${code}:${path.join(".")}:${message}`;
  if (state.reported.has(key)) return;
  state.reported.add(key);
  state.issues.push(Object.freeze({ code, message, path: Object.freeze([...path]) }));
}

function validatedTarget(state: MappingState, target: string): unknown {
  return state.request.validated?.[target];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFormDataLike(value: unknown): value is { getAll: (name: string) => readonly unknown[] } {
  return isRecord(value) && typeof value.getAll === "function";
}
