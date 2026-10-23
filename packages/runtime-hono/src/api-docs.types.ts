/**
 * Keeps OpenAPI exposure and optional UI configuration independent of Scalar's
 * declarations. A selected renderer is supplied by the explicit scalar entrypoint
 * or acquired by prepared application startup before readiness.
 */
import type { JsonValue } from "@relkit/contracts";
import type { OpenApiDocument } from "@relkit/openapi";
import type { MiddlewareHandler } from "hono";
import type { InternalEndpointMode, InternalEndpointOptions } from "./internal-endpoints.js";

/** api docs options configuring dependencies, callbacks and runtime policy. */
export interface ApiDocsOptions {
  /** Optional UI selection; JSON OpenAPI remains independently available. */
  readonly ui?: "scalar" | false;
  /** Already loaded optional renderer, isolated from the core declaration graph. */
  readonly reference?: ApiReferenceFactory;
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

/** Native reference input built only after the existing authorization barrier. */
export interface ApiReferenceConfiguration {
  readonly content?: string;
  readonly url?: string;
  readonly pageTitle: string;
}

/** Factory for an explicitly loaded Hono documentation UI handler. */
export type ApiReferenceFactory = (configuration: ApiReferenceConfiguration) => MiddlewareHandler;
