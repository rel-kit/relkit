import { MISSING, type Missing } from "./request-mapping-body.js";
import type { MappingValue, RequestIssueCode } from "./request-mapping.js";

/** Read a request header using case-insensitive field names.
 * @param headers - Response or request header values.
 * @param name - Field, job or stream name.
 * @returns The first matching header value, or undefined.
 */
export function readHeader(
  headers: Readonly<Record<string, MappingValue>>,
  name: string,
): MappingValue | undefined {
  const key = Object.keys(headers).find(
    (candidate) => candidate.toLowerCase() === name.toLowerCase(),
  );
  return key === undefined ? undefined : headers[key];
}

/** Read a single request value and reject repeated values.
 * @param value - Value to validate or project.
 * @param source - Fixed data or a callback producing the data.
 * @param path - Request path or issue location.
 * @param report - Callback recording a request mapping issue.
 * @returns The scalar value or the missing-value sentinel.
 */
export function readScalar(
  value: MappingValue | undefined,
  source: string,
  path: readonly (string | number)[],
  report: (code: RequestIssueCode, message: string, path: readonly (string | number)[]) => void,
): unknown | Missing {
  if (value === undefined) return MISSING;
  if (Array.isArray(value)) {
    if (value.length !== 1) report("duplicate", `Duplicate ${source} value`, path);
    return value.length === 1 ? value[0] : MISSING;
  }
  return value;
}

/** Decode the route's named catch-all path segments.
 * @param url - Absolute request URL.
 * @param pattern - Declared route path pattern.
 * @param name - Field, job or stream name.
 * @param path - Request path or issue location.
 * @param report - Callback recording a request mapping issue.
 * @returns Frozen decoded segments, or the missing-value sentinel on absence/error.
 */
export function readPathSegments(
  url: string,
  pattern: string | undefined,
  name: string,
  path: readonly (string | number)[],
  report: (code: RequestIssueCode, message: string, path: readonly (string | number)[]) => void,
): readonly string[] | Missing {
  const token = pattern?.split("/").findIndex((segment) => {
    return segment === `*${name}` || segment === `*${name}?`;
  });
  if (token === undefined || token < 0) {
    report("mapping", `Catch-all path "${name}" is not declared by the route`, path);
    return MISSING;
  }
  const segments = new URL(url).pathname.split("/").slice(token);
  if (segments.length === 0 || segments.every((segment) => segment === "")) return MISSING;
  try {
    return Object.freeze(segments.map((segment) => decodeURIComponent(segment)));
  } catch {
    report("mapping", `Catch-all path "${name}" is not valid`, path);
    return MISSING;
  }
}

/** Read one URI-decoded cookie and report duplicates or invalid escapes.
 * @param name - Field, job or stream name.
 * @param headers - Response or request header values.
 * @param path - Request path or issue location.
 * @param report - Callback recording a request mapping issue.
 * @returns The cookie value or the missing-value sentinel.
 */
export function readCookie(
  name: string,
  headers: Readonly<Record<string, MappingValue>>,
  path: readonly (string | number)[],
  report: (code: RequestIssueCode, message: string, path: readonly (string | number)[]) => void,
): unknown | Missing {
  const raw = readHeader(headers, "cookie");
  if (raw === undefined) return MISSING;
  const values = Array.isArray(raw) ? raw : [raw];
  const matches = values.flatMap((value) =>
    value.split(";").flatMap((part: string) => {
      const index = part.indexOf("=");
      return index < 0 || part.slice(0, index).trim() !== name
        ? []
        : [part.slice(index + 1).trim()];
    }),
  );
  if (matches.length > 1) {
    report("duplicate", `Duplicate cookie "${name}"`, path);
    return MISSING;
  }
  if (matches.length === 0) return MISSING;
  try {
    return decodeURIComponent(matches[0] as string);
  } catch {
    report("mapping", `Cookie "${name}" is not valid`, path);
    return MISSING;
  }
}
