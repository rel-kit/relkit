/**
 * Declares server exposure and optional HTTP capability selection without loading
 * native SDKs. Compiler validation supplies defaults before runtime generation;
 * inspector settings retain their existing independent Stage-1 behavior.
 */
/** API documentation visibility and domain exclusions.
 * @example const docs: ApiDocsConfig = { enabledInProduction: false };
 */
export interface ApiDocsConfig {
  /** Explicitly selects Scalar; omitted/false keeps JSON OpenAPI only. */
  readonly ui?: "scalar" | false;
  readonly enabledInProduction?: boolean;
  readonly excludeDomains?: readonly string[];
}

/** HTTP server settings attached to an application descriptor.
 * @example const server: ServerConfig = { port: 3000, apiDocs: { enabledInProduction: false } };
 */
export interface ServerConfig {
  readonly port?: number;
  readonly maxBodyBytes?: number;
  readonly apiDocs?: ApiDocsConfig;
  readonly clientContract?: boolean;
  readonly mcp?: boolean;
  /** Explicitly selects the optional AG-UI HTTP protocol independently of agent RPC. */
  readonly agUi?: boolean;
}

/** Inspector settings attached to an application descriptor.
 * @example const inspector: InspectorConfig = { port: 3210 };
 */
export interface InspectorConfig {
  readonly port?: number;
  readonly enabledInProduction?: boolean;
  readonly maxPreviewBytes?: number;
}

/** Transitional compatibility switches for application authoring.
 * @example const compatibility: AppCompatibilityConfig = { legacyJobs: true };
 */
export interface AppCompatibilityConfig {
  readonly legacyJobs?: boolean;
}
