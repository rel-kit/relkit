import type { ResponseSchemaEntries } from "./response-mapping-utils.js";

/** Contract for response mode used by response mapping. */
export type ResponseMode = "development" | "test" | "production";

/** response mapping options configuring dependencies, callbacks and runtime policy. */
export interface ResponseMappingOptions {
  readonly mode?: ResponseMode;
  readonly responseSchemas?: ResponseSchemaEntries;
  readonly signal?: AbortSignal;
  readonly responseId?: string;
}
