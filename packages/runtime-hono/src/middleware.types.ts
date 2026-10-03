import type { MiddlewareHandler } from "hono";
import type { FRAMEWORK_MIDDLEWARE_ORDER } from "./middleware.js";

/** Contract for framework middleware name used by middleware. */
export type FrameworkMiddlewareName = (typeof FRAMEWORK_MIDDLEWARE_ORDER)[number];

/** Contract for framework middleware used by middleware. */
export interface FrameworkMiddleware {
  readonly name: FrameworkMiddlewareName;
  readonly handler: MiddlewareHandler;
}
