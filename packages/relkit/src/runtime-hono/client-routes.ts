/** Serves the route table the typed client builds its REST requests from. */
import type { Hono } from "hono";
import type { HttpTriggerRegistration } from "../graph/index.js";
import {
  CLIENT_ROUTES_PATH,
  clientApiPaths,
  type ClientRouteEntry,
  type ClientRoutesDocument,
} from "../contracts/client-api.js";
import type { RouteMaterializationOptions } from "./materialize-routes.types.js";
import { errorStatuses, routeOperation } from "./rpc-route-types.js";

/**
 * Lists the routes a typed client may call: every route that is not raw and not hidden
 * from clients, with its `api` path, request mapping, stream format and declared errors.
 * @param triggers - The plan's HTTP routes.
 * @returns The client routes document.
 * @example clientRoutesDocument(options.plan.httpTriggers).routes.map((route) => route.api);
 */
export function clientRoutesDocument(
  triggers: readonly HttpTriggerRegistration[],
): ClientRoutesDocument {
  const routes = clientTriggers(triggers);
  const paths = clientApiPaths(
    routes.map((trigger) => ({
      id: trigger.id,
      method: trigger.config.method,
      path: trigger.config.path,
      targetFunctionId: trigger.targetFunctionId,
    })),
  );
  return {
    protocol: "relkit.client-routes",
    version: 1,
    routes: routes.flatMap((trigger): ClientRouteEntry[] => {
      const api = paths.get(trigger.id);
      if (api === undefined) return [];
      return [
        {
          id: trigger.id,
          api,
          method: trigger.config.method,
          path: trigger.config.path,
          request: trigger.config.request,
          stream: trigger.config.stream?.format ?? null,
          operation: routeOperation(trigger),
          errors: errorStatuses(trigger).map(([code]) => code),
        },
      ];
    }),
  };
}

/**
 * Selects the routes that the typed client can call.
 * @param triggers - The plan's HTTP routes.
 * @returns Routes that are neither raw handlers nor hidden from clients.
 */
export function clientTriggers(
  triggers: readonly HttpTriggerRegistration[],
): HttpTriggerRegistration[] {
  return triggers.filter(
    (trigger) => trigger.config.rawHandler !== true && trigger.config.client !== false,
  );
}

/**
 * Installs the no-store client routes endpoint. The document holds only what the
 * OpenAPI document already publishes for these routes.
 * @param app - Hono application receiving the endpoint.
 * @param options - Route plan of the active generation.
 * @returns Nothing; registers `GET /_relkit/v1/client/routes`.
 */
export function installClientRoutesEndpoint(app: Hono, options: RouteMaterializationOptions): void {
  const document = clientRoutesDocument(options.plan.httpTriggers);
  app.get(CLIENT_ROUTES_PATH, (context) =>
    context.json(document, 200, {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    }),
  );
}
