/**
 * Exposes transport clients and the generated contract augmentation authority.
 * Install @relkit/client for HTTP/WebSocket clients; React and TanStack peers
 * are needed only by their explicit integration entrypoints.
 */
import type { RouterContract } from "@orpc/contract";
export { ORPCError } from "@orpc/client";
export { createClient, createAutoClient, createWebSocketClient } from "./transport.js";
export { api, apiRoutePath, createApi } from "./api.js";
export { RelkitNetworkError } from "./client-errors.js";
export type {
  AnyRouteContract,
  ApiCallOptions,
  ApiClient,
  ApiMutationRoute,
  ApiQueryRoute,
  ApiRoute,
  ApiStreamRoute,
  RouteContractOf,
  RouteError,
  RouteInput,
  RouteItem,
  RouteOutput,
} from "./api.types.js";
export type {
  ClientRouteContract,
  ClientStreamContract,
  RelkitClientError,
  RelkitDeclaredError,
  RelkitUndeclaredError,
  RelkitUndeclaredErrorCode,
  ClientHeadersInit,
  ClientHeaders,
  CreateClientOptions,
  CreateWebSocketClientOptions,
  CreateAutoClientOptions,
} from "./index.types.js";

/**
 * Shape of the generated `api` object: services, then their routes. The generated
 * `client-registry.d.ts` augments this interface.
 */
export interface ClientApi {}

/** Original augmentation authority; generated applications extend this exact module. */
export interface DefaultContractRegistry {}

/** Contract inferred from the preserved public registry augmentation. */
export type DefaultContract = DefaultContractRegistry extends {
  readonly contract: infer Contract extends RouterContract;
}
  ? Contract
  : RouterContract;
