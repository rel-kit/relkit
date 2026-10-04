import type { Guard, Project } from "./resource-routes.types.js";
import { API_BASE_PATH, type JsonValue } from "@relkit/contracts";
import type { Hono } from "hono";
import { json, required, requiredParam } from "./router-utils.js";
import type { ResolvedActiveGeneration } from "./shared.js";
import type { InspectorProjection } from "./query.types.js";
import { bucketObjects, bucketPreview, cacheKeys, cacheValue } from "./resource-explorer.js";

/**
 * Installs native resource edges using the already-authorized query owner.
 * @param app - Native router.
 * @param guard - Authorization-before-generation guard.
 * @param maxPreviewBytes - Bounded native preview limit.
 * @param project - Shared query service projection edge, supplied by the installing owner.
 * @returns No value; routes are installed synchronously.
 */
export function installResourceExplorerEndpoints(
  app: Hono,
  guard: Guard,
  maxPreviewBytes: number,
  project: Project = compatibilityProject,
): void {
  for (const [path, kind] of [
    ["buckets/:id/objects", "bucket-objects"],
    ["cache/:id/keys", "cache-keys"],
  ] as const) {
    app.get(
      `${API_BASE_PATH}/runtime/${path}`,
      guard(async (context, generation) =>
        json(
          await project(generation, {
            kind,
            id: requiredParam(context, "id"),
            request: context.req.raw,
          }),
        ),
      ),
    );
  }
  for (const [path, kind] of [
    ["buckets/:id/objects/preview", "bucket-preview"],
    ["cache/:id/keys/value", "cache-value"],
  ] as const) {
    app.get(
      `${API_BASE_PATH}/runtime/${path}`,
      guard(async (context, generation) =>
        json(
          await project(generation, {
            kind,
            id: requiredParam(context, "id"),
            request: context.req.raw,
            maximumBytes: maxPreviewBytes,
          }),
          200,
          { "content-disposition": "inline", "content-security-policy": "sandbox" },
        ),
      ),
    );
  }
}

/**
 * Adapts legacy direct installer calls to the reused finite operation owner.
 * @param generation - Generation supplied by the caller's authorization guard.
 * @param projection - Resource projection declared by this installer.
 * @returns Bounded redacted resource JSON; unrelated projection kinds fail explicitly.
 */
function compatibilityProject(
  generation: ResolvedActiveGeneration | undefined,
  projection: InspectorProjection,
): Promise<JsonValue> {
  const active = required(generation);
  switch (projection.kind) {
    case "bucket-objects":
      return bucketObjects(active, projection.id, projection.request);
    case "bucket-preview":
      return bucketPreview(active, projection.id, projection.request, projection.maximumBytes);
    case "cache-keys":
      return cacheKeys(active, projection.id, projection.request);
    case "cache-value":
      return cacheValue(active, projection.id, projection.request, projection.maximumBytes);
    default:
      throw new TypeError("resource projection is invalid");
  }
}
