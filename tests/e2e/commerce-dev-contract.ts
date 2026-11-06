/**
 * Plays the `relkit dev` contract channel in the commerce browser fixture: the supervisor's
 * contract publisher serves the event stream, and a test-only control endpoint switches the
 * public fingerprint the backend reports, as a backend contract change would.
 */
import { createContractPublisher } from "../../packages/cli/src/supervisor/contract-publish.ts";

/** Test-only endpoint that publishes a new public fingerprint. */
export const CONTRACT_CONTROL_PATH = "/__relkit-test/contract";

/**
 * Wraps the fixture's request handler with the development contract channel.
 * @param next - The application's own request handler.
 * @returns The wrapped handler and a close function for shutdown.
 */
export function withDevContract(next: (request: Request) => Promise<Response> | Response) {
  const contracts = createContractPublisher();
  let fingerprint: string | undefined;
  let generation = 1;
  return {
    async fetch(request: Request): Promise<Response> {
      const streamed = contracts.intercept(request);
      if (streamed !== undefined) return streamed;
      const path = new URL(request.url).pathname;
      if (path === CONTRACT_CONTROL_PATH && request.method === "POST") {
        const body = (await request.json()) as { readonly publicFingerprint?: unknown };
        if (typeof body.publicFingerprint !== "string")
          return new Response("publicFingerprint is required", { status: 400 });
        fingerprint = body.publicFingerprint;
        generation += 1;
        contracts.publish(generation);
        return new Response(null, { status: 204 });
      }
      const response = await next(request);
      if (fingerprint === undefined || path !== "/_relkit/v1/client/identity" || !response.ok)
        return response;
      const document = (await response.json()) as Record<string, unknown>;
      const headers = new Headers(response.headers);
      headers.delete("content-length");
      return new Response(JSON.stringify({ ...document, publicFingerprint: fingerprint }), {
        status: response.status,
        headers,
      });
    },
    close: () => contracts.close(),
  };
}
