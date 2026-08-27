import { API_BASE_PATH } from "@relkit/contracts";
import type { Context, Hono } from "hono";
import { bucketObjects, bucketPreview, cacheKeys, cacheValue } from "./resource-explorer.js";
import { json, required, requiredParam } from "./router-utils.js";
import type { ResolvedActiveGeneration } from "./shared.js";

type Guard = (
  handler: (context: Context, generation?: ResolvedActiveGeneration) => Promise<Response>,
  includeGeneration?: boolean,
) => (context: Context) => Promise<Response>;

export function installResourceExplorerEndpoints(
  app: Hono,
  guard: Guard,
  maxPreviewBytes: number,
): void {
  app.get(
    `${API_BASE_PATH}/runtime/buckets/:id/objects`,
    guard(async (context, generation) =>
      json(
        await bucketObjects(
          await required(generation),
          requiredParam(context, "id"),
          context.req.raw,
        ),
      ),
    ),
  );
  app.get(
    `${API_BASE_PATH}/runtime/buckets/:id/objects/preview`,
    guard(async (context, generation) =>
      json(
        await bucketPreview(
          await required(generation),
          requiredParam(context, "id"),
          context.req.raw,
          maxPreviewBytes,
        ),
        200,
        { "content-disposition": "inline", "content-security-policy": "sandbox" },
      ),
    ),
  );
  app.get(
    `${API_BASE_PATH}/runtime/cache/:id/keys`,
    guard(async (context, generation) =>
      json(
        await cacheKeys(await required(generation), requiredParam(context, "id"), context.req.raw),
      ),
    ),
  );
  app.get(
    `${API_BASE_PATH}/runtime/cache/:id/keys/value`,
    guard(async (context, generation) =>
      json(
        await cacheValue(
          await required(generation),
          requiredParam(context, "id"),
          context.req.raw,
          maxPreviewBytes,
        ),
        200,
        { "content-disposition": "inline", "content-security-policy": "sandbox" },
      ),
    ),
  );
}
