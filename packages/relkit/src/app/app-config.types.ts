/**
 * Declares server exposure and optional HTTP capability selection without loading
 * native SDKs. Compiler validation supplies defaults before runtime generation;
 * inspector settings select only the development bridge, independently of a tool.
 */
import type { InspectorConfigurationInput } from "../contracts/index.js";
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
  /** Enables the MCP endpoint; `{ auth: "required" }` limits it to signed-in callers. */
  readonly mcp?: boolean | { readonly auth?: "required" };
  /** Explicitly selects the optional AG-UI HTTP protocol independently of agent RPC. */
  readonly agUi?: boolean;
  /** Runs once after the application's providers are ready and before the server accepts
   * requests; `getRelkit()` returns the application's handle inside it. A rejection stops startup.
   * @example onStart: async () => { await getRelkit().functions.catalog.warmPrices({}); }
   */
  readonly onStart?: () => void | Promise<void>;
}

/** Development bridge selection; installing or running the UI is independent.
 * @example const inspector: InspectorConfig = { enabled: true };
 */
export interface InspectorConfig extends InspectorConfigurationInput {}
