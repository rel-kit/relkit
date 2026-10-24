/**
 * Describes optional installers without importing their SDKs. Synchronous core
 * construction borrows explicitly loaded installers; prepared construction loads
 * and validates selected capabilities before publishing its application.
 */
import type { Hono } from "hono";
import type { RouteMaterializationOptions } from "./materialize-routes.types.js";

/** Optional protocol capability initialized independently of ordinary RPC. */
export type OptionalHttpCapability = "mcp" | "ag-ui" | "scalar";

/** Already loaded endpoint installer; configuration contains no request context. */
export type OptionalHttpInstaller = (app: Hono, options: RouteMaterializationOptions) => void;

/** Explicit native installers supplied by their optional public entrypoints. */
export interface OptionalHttpInstallers {
  readonly mcp?: OptionalHttpInstaller;
  readonly agUi?: OptionalHttpInstaller;
}

/** MCP selection alone, separate from the native tool schema declarations. */
export interface McpOptions {
  readonly enabled?: boolean;
}
