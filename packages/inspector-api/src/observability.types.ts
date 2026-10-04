import type { MaybePromise } from "@relkit/contracts";
import type { ObservabilityQuery, ObservabilityStream } from "@relkit/observability";
import type { InspectorLoggingOptions } from "./execution.types.js";

/** Supported observation environments used for default exposure and production protection. */
export type ObservabilityEndpointMode = "development" | "test" | "production";

/** Native observation query/stream authorities, authorization and configured server logging. */
export interface ObservabilityEndpointOptions {
  readonly query: ObservabilityQuery;
  readonly stream: ObservabilityStream;
  readonly mode?: ObservabilityEndpointMode;
  readonly environment?: ObservabilityEndpointMode;
  readonly enabled?: boolean;
  readonly bearerToken?: string;
  readonly authorize?: (request: Request) => MaybePromise<boolean>;
  readonly logging?: InspectorLoggingOptions;
}
