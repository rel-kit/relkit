/**
 * Calls routes over their REST endpoints, the same requests the OpenAPI document describes,
 * so a typed client call is reproducible with curl.
 */
import { ORPCError } from "@orpc/client";
import type { CreateClientOptions } from "./index.types.js";
import { encodeRestRequest } from "./rest-request.js";
import { decodeRestResponse } from "./rest-response.js";
import { createRouteTable } from "./rest-routes.js";
import { resolveHeaders } from "./transport-native.js";

/** Route calls over REST. */
export interface RestLink {
  /**
   * Tells route calls from the framework procedures (channels, agents, jobs) that keep
   * the RPC protocol.
   * @param path - Call path.
   * @returns Whether the call names a route.
   */
  readonly handles: (path: readonly string[]) => boolean;
  /**
   * Calls one route.
   * @param path - `api` path, `METHOD /path` selector or route ID.
   * @param input - Call input.
   * @param options - Call cancellation.
   * @returns The route output, or an async iterator for a stream route.
   */
  readonly call: (
    path: readonly string[],
    input: unknown,
    options: { readonly signal?: AbortSignal | undefined },
  ) => Promise<unknown>;
}

/**
 * Creates the REST link for one client.
 * @param options - Base URL, headers, credentials and fetch of the client.
 * @returns The link; its route table loads on the first call.
 * @example const link = createRestLink({ baseUrl: "http://127.0.0.1:3000" });
 */
export function createRestLink(options: CreateClientOptions): RestLink {
  const fetcher = options.fetch ?? globalThis.fetch;
  const credentials = options.credentials ?? "include";
  const table = createRouteTable(options.baseUrl, async (url, signal) =>
    fetcher(url, {
      headers: await resolveHeaders(options.headers),
      credentials,
      cache: "no-store",
      ...(signal === undefined ? {} : { signal }),
    }),
  );
  return {
    handles: (path) => path[0] !== "jobs" && !(path[0] ?? "").startsWith("relkit."),
    async call(path, input, call) {
      const route = await table.find(path, call.signal);
      if (route === undefined)
        throw new ORPCError("NOT_FOUND", {
          status: 404,
          message: `The backend has no route named "${path.join(".")}".`,
        });
      const controller = new AbortController();
      const signal =
        call.signal === undefined
          ? controller.signal
          : AbortSignal.any([call.signal, controller.signal]);
      const headers = await resolveHeaders(options.headers);
      const { url, init } = encodeRestRequest(options.baseUrl, route, input, headers);
      const response = await fetcher(url, { ...init, credentials, signal });
      return decodeRestResponse(route, response, () => controller.abort());
    },
  };
}
