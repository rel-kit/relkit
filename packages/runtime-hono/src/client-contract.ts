import type { Hono } from "hono";

export const CLIENT_CONTRACT_PATH = "/_relkit/v1/client-contract.json";

export interface ClientContractEndpointOptions {
  readonly enabled?: boolean;
  readonly document?: unknown;
}

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
