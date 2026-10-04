import type { RouterContract } from "@orpc/contract";
export { ORPCError } from "@orpc/client";
export { createClient, createAutoClient, createWebSocketClient } from "./transport.js";
export type {
  ClientHeadersInit,
  ClientHeaders,
  CreateClientOptions,
  CreateWebSocketClientOptions,
  CreateAutoClientOptions,
} from "./index.types.js";

/** Original augmentation authority; generated applications extend this exact module. */
export interface DefaultContractRegistry {}

/** Contract inferred from the preserved public registry augmentation. */
export type DefaultContract = DefaultContractRegistry extends {
  readonly contract: infer Contract extends RouterContract;
}
  ? Contract
  : RouterContract;
