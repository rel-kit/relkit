import { injectTraceContext } from "@relkit/contracts";
import { currentExecutionContext, publicTrace, RelkitSpan, spanContext } from "@relkit/invocation";
import type { RouterContract, RouterContractClient } from "@orpc/contract";
import { createClient, type CreateClientOptions, type DefaultContract } from "./index.js";

/** Bun server client with operation-time W3C propagation. Response bodies remain untouched. */
export function createServerClient<Contract extends RouterContract = DefaultContract>(
  options: CreateClientOptions,
): RouterContractClient<Contract> {
  const fetcher = options.fetch ?? globalThis.fetch;
  return createClient<Contract>({
    ...options,
    fetch: ((input, init) =>
      publicTrace.span(
        "relkit.client.request",
        {
          kind: "client",
          attributes: { "http.request.method": init?.method ?? "POST" },
        },
        () => {
          const headers = new Headers(init?.headers);
          const active = currentExecutionContext()?.span;
          if (active instanceof RelkitSpan) injectTraceContext(headers, spanContext(active));
          return fetcher(input, { ...init, headers });
        },
      )) as typeof globalThis.fetch,
  });
}
