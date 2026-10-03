import type { MaybePromise } from "@relkit/contracts";
import type { allowedMethods, allowedOrigins } from "./transport-security.js";

/** transport security options configuring dependencies, callbacks and runtime policy. */
export interface TransportSecurityOptions {
  readonly allowedOrigins: readonly string[];
  readonly allowedMethods?: readonly string[];
  readonly allowedHeaders?: readonly string[];
  readonly csrfHeader?: string;
  readonly validateCsrf?: (request: Request, token: string) => MaybePromise<boolean>;
  readonly trustedService?: (request: Request) => MaybePromise<boolean>;
}
