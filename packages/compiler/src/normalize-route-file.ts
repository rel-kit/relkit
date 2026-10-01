import { Effect } from "effect";
import { runCompilerSync } from "./compatibility.js";
import { observeCompiler } from "./observability.js";
import { method, path } from "./normalize-utils.js";
import { add } from "./normalize-pass-utils.js";
import { parseRouteFilePathEffect } from "./route-file.js";
import {
  NORMALIZE_CODES,
  type NormalizedDescriptor,
  type NormalizationWork,
} from "./normalize-types.js";
import { isRecord } from "./normalize-utils.js";

/**
 * Binds route methods and paths from conventional source filenames.
 * @param work - Invocation-owned descriptors, indexes, and diagnostics.
 * @param descriptor - Descriptor whose contract is checked.
 * @param value - Declared metadata to inspect without coercion.
 * @returns A lazy effect yielding the checked result; findings append to the workspace diagnostics.
 * @remarks Unexpected metadata access failures remain defects.
 * @see {@link normalizeCompilationEffect} for ordered stage composition.
 */
export const bindRouteFileEffect = Effect.fn("Compiler.bindRouteFile")(
  function* (
    work: NormalizationWork,
    descriptor: NormalizedDescriptor,
    value: Record<string, any>,
  ) {
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
    const parsed = yield* parseRouteFilePathEffect(descriptor.source.file).pipe(
      Effect.catchTag("RouteFileError", (error) =>
        Effect.sync(() => {
          add(
            work,
            descriptor,
            NORMALIZE_CODES.routeFile,
            `Move this route to src/routes/**/route.ts. ${error.cause instanceof Error ? error.cause.message : String(error.cause)}`,
          );
          return undefined;
        }),
      ),
    );
    if (parsed !== undefined) {
      value.path = parsed.canonicalPath;
      value.runtimePaths = parsed.runtimePaths;
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
      const authRaw =
        value.raw === true && isRecord(value.auth) && value.auth.kind === "better-auth";
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
  },
  (effect, work, descriptor, value) =>
    observeCompiler("normalization", "bindRouteFile", effect, () => ({
      descriptors: work.descriptors.length,
      diagnostics: work.diagnostics.length,
    })),
);

/**
 * Binds route methods and paths from conventional source filenames.
 * @param work - Invocation-owned descriptors, indexes, and diagnostics.
 * @param descriptor - Descriptor whose contract is checked.
 * @param value - Declared metadata to inspect without coercion.
 * @returns The checked result after executing the Effect at the compatibility boundary.
 * @remarks Unexpected metadata access failures remain defects.
 * @see {@link normalizeCompilationEffect} for ordered stage composition.
 */
export function bindRouteFile(
  work: NormalizationWork,
  descriptor: NormalizedDescriptor,
  value: Record<string, any>,
): void {
  return runCompilerSync(bindRouteFileEffect(work, descriptor, value));
}
