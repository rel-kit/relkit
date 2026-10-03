import { BucketCapabilityError, type BucketOperationContext } from "@relkit/buckets";

import { runLocal, runLocalSync } from "../local-effect.js";

import { type LocalBucketListOptions, type LocalBucketProvider } from "./types.js";

import type { LocalBucketEffects } from "./provider.types.js";

/**
 * Projects the owning service into the existing public boundary.
 * @param service - Fully acquired domain service.
 * @returns Compatible synchronous metadata and Promise methods.
 */
export function promiseBucketProvider(service: LocalBucketEffects): LocalBucketProvider {
  const list = ((prefix?: string, options?: LocalBucketListOptions) =>
    options !== undefined && !isOperationContext(options)
      ? runLocal(service.listPage(prefix, options))
      : runLocal(
          service.list(prefix, isOperationContext(options) ? options : undefined),
        )) as LocalBucketProvider["list"];
  return Object.freeze({
    ...service.metadata,
    list,
    put: (key, bytes, settings, context) => runLocal(service.put(key, bytes, settings, context)),
    get: (key, context) => runLocal(service.get(key, context)),
    head: (key, context) => runLocal(service.head(key, context)),
    delete: (key, context) => runLocal(service.delete(key, context)),
    exists: (key, context) => runLocal(service.exists(key, context)),
    listPage: (prefix, options) => runLocal(service.listPage(prefix, options)),
    createReadUrl: (key, context) => {
      runLocalSync(service.validate(key, context));
      return Promise.reject(new BucketCapabilityError("signedReadUrl", "createReadUrl"));
    },
    createWriteUrl: (key, context) => {
      runLocalSync(service.validate(key, context));
      return Promise.reject(new BucketCapabilityError("signedWriteUrl", "createWriteUrl"));
    },
    ready: () => runLocal(service.ready()),
    close: () => runLocal(service.close()),
    inspector: {
      list: (request) => runLocal(service.inspectList(request)),
      preview: (request) => runLocal(service.preview(request)),
    },
  });
}

/** Recognizes the legacy operation-context overload without interpreting pagination.
 * @param value - Candidate value to validate, normalize or encode.
 * @returns The result described by the operation contract.
 */
function isOperationContext(value: unknown): value is BucketOperationContext {
  return value !== null && typeof value === "object" && "operation" in value && "signal" in value;
}
