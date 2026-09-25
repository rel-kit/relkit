export type * from "./index.types.js";

export const OBSERVABILITY_INDEX_VERSION = 1 as const;
export const DEFAULT_INDEX_MAX_ENTRIES = 8_192;
export const DEFAULT_INDEX_PAGE_SIZE = 100;
export const DEFAULT_RETENTION_MAX_BYTES = 32 * 1024 * 1024;
export const DEFAULT_RETENTION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;
