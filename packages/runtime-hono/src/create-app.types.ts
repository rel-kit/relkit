/** Core application options retain checked generation policy while optional protocol installers and SDK selections remain explicit, SDK-free declarations. */
import type { MiddlewareHandler } from "hono";
import type { RouteMaterializationOptions } from "./materialize-routes.js";
import type {
  FRAMEWORK_MIDDLEWARE_ORDER,
  FrameworkMiddleware,
  HttpMiddlewareOptions,
} from "./middleware.js";
import type { InternalEndpointOptions } from "./internal-endpoints.js";
import type { ApiDocsOptions } from "./api-docs.js";
import type { ClientContractEndpointOptions } from "./client-contract.js";
import type { McpOptions, OptionalHttpInstallers } from "./optional-transports.types.js";
import type { ClientIdentityRuntime } from "./client-identity.js";

/** Public framework middleware input validated before domain admission. */
export type FrameworkMiddlewareInput =
  | Partial<Record<(typeof FRAMEWORK_MIDDLEWARE_ORDER)[number], MiddlewareHandler>>
  | readonly FrameworkMiddleware[];

/** create app options configuring dependencies, callbacks and runtime policy. */
export interface CreateAppOptions extends RouteMaterializationOptions {
  readonly frameworkMiddleware?: FrameworkMiddlewareInput;
  readonly middleware?: HttpMiddlewareOptions;
  readonly internalEndpoints?: InternalEndpointOptions;
  readonly apiDocs?: ApiDocsOptions;
  readonly clientContract?: ClientContractEndpointOptions;
  readonly clientIdentity?: ClientIdentityRuntime;
  readonly mcp?: McpOptions;
  /** Selects AG-UI independently of ordinary agent RPC and streaming. */
  readonly agUi?: boolean;
  /** Native installers already selected by explicit optional entrypoints. */
  readonly optionalTransports?: OptionalHttpInstallers;
  /** Consumer directory used for fresh selected SDK validation before readiness. */
  readonly dependencyProjectRoot?: string;
  /** Package manager used in actionable selected-dependency diagnostics. */
  readonly packageManager?: "bun" | "npm" | "pnpm";
}
