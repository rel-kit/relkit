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
import type { McpOptions } from "./mcp.js";
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
}
