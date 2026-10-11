import type { JsonValue } from "@relkit/contracts";
import type { OpenApiDocument } from "@relkit/openapi";
import type { InternalEndpointMode, InternalEndpointOptions } from "./internal-endpoints.js";

/** api docs options configuring dependencies, callbacks and runtime policy. */
export interface ApiDocsOptions {
  readonly mode?: InternalEndpointMode;
  readonly enabled?: boolean;
  readonly enabledInProduction?: boolean;
  readonly excludeDomains?: readonly string[];
  readonly bearerToken?: string;
  readonly authorize?: InternalEndpointOptions["authorize"];
  readonly document?: OpenApiDocument | JsonValue;
  /** Native authentication schema, acquired only for authorized documentation requests. */
  readonly getAuthDocument?: () => Promise<JsonValue>;
}
