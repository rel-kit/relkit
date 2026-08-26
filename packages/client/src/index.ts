import { createORPCClient, ORPCError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterContract, RouterContractClient } from "@orpc/contract";

export { ORPCError };

export interface DefaultContractRegistry {}

export type DefaultContract = DefaultContractRegistry extends {
  readonly contract: infer Contract extends RouterContract;
}
  ? Contract
  : RouterContract;

export type ClientHeadersInit =
  Headers | Readonly<Record<string, string>> | readonly (readonly [string, string])[];
export type ClientHeaders =
  ClientHeadersInit | (() => ClientHeadersInit | Promise<ClientHeadersInit>);

export interface CreateClientOptions {
  readonly baseUrl: string;
  readonly headers?: ClientHeaders;
  readonly credentials?: RequestInit["credentials"];
  readonly fetch?: typeof globalThis.fetch;
}

export function createClient<Contract extends RouterContract = DefaultContract>(
  options: CreateClientOptions,
): RouterContractClient<Contract> {
  const endpoint = endpointFor(options.baseUrl);
  const fetcher = options.fetch ?? globalThis.fetch;
  const link = new RPCLink({
    origin: endpoint.origin,
    url: endpoint.pathname as `/${string}`,
    headers: () => resolveHeaders(options.headers),
    fetch: (url, init) =>
      fetcher(url, {
        ...init,
        credentials: options.credentials ?? "include",
      }),
  });
  return createORPCClient(link) as RouterContractClient<Contract>;
}

function endpointFor(baseUrl: string): URL {
  const base = new URL(baseUrl);
  const root = base.pathname.endsWith("/") ? base : new URL(`${base.pathname}/`, base);
  return new URL("rpc", root);
}

async function resolveHeaders(value: ClientHeaders | undefined): Promise<Headers> {
  const resolved = typeof value === "function" ? await value() : value;
  if (resolved instanceof Headers) return resolved;
  const headers = new Headers();
  if (Array.isArray(resolved)) {
    for (const [name, entry] of resolved) headers.append(name, entry);
  } else {
    for (const [name, entry] of Object.entries(resolved ?? {})) headers.set(name, entry);
  }
  return headers;
}
