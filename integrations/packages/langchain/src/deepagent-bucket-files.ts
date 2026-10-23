/** Collects bucket-backed file entries for native filesystem operations after path normalization, keeping metadata separate from fetched file content. */

export type * from "./deepagent-bucket-files.types.js";
export {
  bucketKey,
  bucketKeyEffect,
  createBucketContext,
  createBucketContextEffect,
  filePath,
  filePathEffect,
  virtualPath,
  virtualPathEffect,
} from "./deepagent-bucket-path.js";
export {
  errorMessage,
  errorMessageEffect,
  isControlFailure,
  isControlFailureEffect,
  isTextMimeType,
  isTextMimeTypeEffect,
  normalizedPage,
  normalizedPageEffect,
} from "./deepagent-bucket-format.js";
