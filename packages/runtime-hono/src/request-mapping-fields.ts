import { MISSING, parseForm, parseJson, type Missing } from "./request-mapping-body.js";
import type { MappingState } from "./request-mapping-object.js";
import type { RequestIssueCode, RequestMappingFailure } from "./request-mapping.js";

/** Read one JSON field, preferring middleware-validated input.
 * @param name - Field, job or stream name.
 * @param state - Shared body parsing, validation and issue state.
 * @param path - Request path or issue location.
 * @returns The own field value or the missing-value sentinel.
 */
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

/** Read validated JSON or parse the request body once and record errors.
 * @param state - Shared body parsing, validation and issue state.
 * @param path - Request path or issue location.
 * @returns The parsed value or the missing-value sentinel.
 */
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

/** Look up an own field in a middleware-validated request source.
 * @param state - Shared body parsing, validation and issue state.
 * @param target - Target descriptor or validated request source.
 * @param name - Field, job or stream name.
 * @returns A found flag and the validated value when present.
 */
export function validatedSource(state: MappingState, target: string, name: string) {
  const validated = validatedTarget(state, target);
  return isRecord(validated) && Object.hasOwn(validated, name)
    ? { found: true, value: validated[name] }
    : { found: false };
}

/** Read validated or parsed multipart values and report duplicate scalars.
 * @param name - Multipart field name to read.
 * @param state - Shared body parsing, validation and issue state.
 * @param path - Request path or issue location.
 * @param all - Whether repeated multipart values are accepted.
 * @returns One field, all field values, or the missing-value sentinel.
 */
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

/** Freeze accumulated request mapping issues for the public failure result.
 * @param state - Shared body parsing, validation and issue state.
 * @returns An immutable failed mapping result.
 */
export function mappingFailure(state: MappingState): RequestMappingFailure {
  return { ok: false, issues: Object.freeze(state.issues.map((item) => Object.freeze(item))) };
}

/** Record one mapping issue, deduplicating by code, path and message.
 * @param state - Shared body parsing, validation and issue state.
 * @param code - Stable public error or mapping issue code.
 * @param message - Public diagnostic message or browser message.
 * @param path - Request path or issue location.
 * @returns Nothing; appends a frozen issue only once.
 */
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

/** Retrieve the middleware-validated value for a request source.
 * @param state - Shared body parsing, validation and issue state.
 * @param target - Target descriptor or validated request source.
 * @returns The source value, or undefined if no validation result exists.
 */
function validatedTarget(state: MappingState, target: string): unknown {
  return state.request.validated?.[target];
}

/** Check whether a value is a non-null object suitable for field inspection.
 * @param value - Value to validate or project.
 * @returns Whether object fields can be inspected.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Recognize a validated form source supporting getAll.
 * @param value - Value to validate or project.
 * @returns Whether all values for a field can be read.
 */
function isFormDataLike(value: unknown): value is { getAll: (name: string) => readonly unknown[] } {
  return isRecord(value) && typeof value.getAll === "function";
}
