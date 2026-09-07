import { method, path } from "./normalize-utils.js";
import { add } from "./normalize-pass-utils.js";
import { parseRouteFilePath } from "./route-file.js";
import {
  NORMALIZE_CODES,
  type NormalizedDescriptor,
  type NormalizationWork,
} from "./normalize-types.js";
import { isRecord } from "./normalize-utils.js";

/** Adds file- and export-derived transport metadata to one authored route. */
export function bindRouteFile(
  work: NormalizationWork,
  descriptor: NormalizedDescriptor,
  value: Record<string, any>,
): void {
  if (descriptor.reference === undefined) {
    const nextMethod = method(value.method);
    const nextPath = path(value.path);
    if (nextMethod !== undefined) value.method = nextMethod;
    if (nextPath !== undefined) value.path = nextPath;
    return;
  }
  if (value.method !== undefined || value.path !== undefined) {
    add(
      work,
      descriptor,
      NORMALIZE_CODES.routeTransport,
      "Remove method and path from defineRoute; export it as GET, POST, PUT, PATCH, DELETE, HEAD, or OPTIONS from src/routes/**/route.ts.",
    );
  }
  try {
    const parsed = parseRouteFilePath(descriptor.source.file);
    value.path = parsed.canonicalPath;
    value.runtimePaths = parsed.runtimePaths;
  } catch (error) {
    add(
      work,
      descriptor,
      NORMALIZE_CODES.routeFile,
      `Move this route to src/routes/**/route.ts. ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const nextMethod = method(descriptor.exportName);
  if (descriptor.exportKind !== "named" || nextMethod === undefined) {
    add(
      work,
      descriptor,
      NORMALIZE_CODES.routeExport,
      "Export the route with a named HTTP method such as `export const GET = defineRoute(...)`; default route exports are not supported.",
    );
  } else {
    value.method = nextMethod;
    const authRaw = value.raw === true && isRecord(value.auth) && value.auth.kind === "better-auth";
    if (nextMethod === "ALL" ? !authRaw : authRaw) {
      add(
        work,
        descriptor,
        NORMALIZE_CODES.routeExport,
        "ALL is reserved for Better Auth routes, and Better Auth routes must use ALL.",
      );
    }
  }
  const nextPath = path(value.path);
  if (nextPath !== undefined) value.path = nextPath;
}
