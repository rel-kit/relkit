import type { Hono } from "hono";
import type { ClientContractEndpointOptions } from "./client-contract.types.js";
export type { ClientContractEndpointOptions } from "./client-contract.types.js";

/** Stable location of the runtime's generated public client contract. */
export const CLIENT_CONTRACT_PATH = "/_relkit/v1/client-contract.json";

/** Install the no-store client contract document endpoint when enabled.
 * @param app - Hono application receiving the route.
 * @param options - Runtime configuration and dependencies for this operation.
 * @returns Nothing; registers the endpoint on the supplied app.
 */
export function installClientContractEndpoint(
  app: Hono,
  options: ClientContractEndpointOptions = {},
): void {
  if (options.enabled === false) return;
  app.get(CLIENT_CONTRACT_PATH, (context) =>
    context.json(options.document ?? {}, 200, {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    }),
  );
}
