import { normalizeId } from "@zsys/contracts";

const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

/** Encodes a route identity without placing slashes or transport punctuation in the ID. */
export function encodeRouteId(
  method: string,
  routePath: string,
  explicitId?: unknown,
): string | undefined {
  if (explicitId !== undefined) return normalizeId(explicitId);
  const normalizedMethod = method.trim().toUpperCase();
  if (!HTTP_METHODS.has(normalizedMethod)) return undefined;
  const segments = routeSegments(routePath);
  if (segments === undefined) return undefined;
  const value = ["route", normalizedMethod.toLowerCase(), ...segments].join(".");
  return normalizeId(value);
}

function routeSegments(value: string): readonly string[] | undefined {
  const normalized = value.trim().replaceAll("\\", "/");
  if (!normalized.startsWith("/")) return undefined;
  const raw = normalized.split("/").filter(Boolean);
  if (raw.length === 0) return ["root"];
  const result: string[] = [];
  for (const segment of raw) {
    const dynamic = /^:([A-Za-z_][A-Za-z0-9_]*)$/.exec(segment) ?? /^\{([^{}]+)\}$/.exec(segment);
    if (dynamic !== null) {
      const name = kebab(dynamic[1]);
      if (name === undefined) return undefined;
      result.push(`by-${name}`);
      continue;
    }
    const catchAll = /^(\*|\.\.\.)([A-Za-z_][A-Za-z0-9_]*)(\?)?$/.exec(segment);
    if (catchAll !== null) {
      const name = kebab(catchAll[2]);
      if (name === undefined) return undefined;
      result.push(catchAll[3] === "?" ? `optional-catch-all-${name}` : `catch-all-${name}`);
      continue;
    }
    const staticSegment = kebab(segment);
    if (staticSegment === undefined) return undefined;
    result.push(staticSegment);
  }
  return result;
}

function kebab(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value
    .normalize("NFKC")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
    .toLowerCase();
  return normalized === "" ? undefined : normalized;
}
