import type { MappingValue, RequestIssueCode } from "./request-mapping.js";
import { MISSING, type Missing } from "./request-mapping-body.js";

export function readHeader(
  headers: Readonly<Record<string, MappingValue>>,
  name: string,
): MappingValue | undefined {
  const key = Object.keys(headers).find(
    (candidate) => candidate.toLowerCase() === name.toLowerCase(),
  );
  return key === undefined ? undefined : headers[key];
}

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
