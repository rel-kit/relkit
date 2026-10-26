/**
 * Adapts Bun listeners and Fetch forwarding to the private bridge contract.
 * FiberSet joins request operations when the listener's Scope closes; native
 * forwarding keeps cancellation and never follows redirects with credentials.
 */
import { Context, Effect, Exit, FiberSet, Layer, Scope } from "effect";
import { connectionAttempt, InspectionConnectionError } from "./connection-error.js";
import type { InspectionNativeOperations } from "./bridge.types.js";
import { ownInspectionResponse } from "./native-response.js";

/** Native transport authority; deterministic Layers can substitute this contract. */
export class InspectionNative extends Context.Service<
  InspectionNative,
  InspectionNativeOperations
>()("relkit/inspection/Native", {
  make: Effect.sync(
    () =>
      ({
        listen: listenInspection,
        forward: forwardInspection,
      }) satisfies InspectionNativeOperations,
  ),
}) {}

/** Supplies native adapters without binding until the bridge is explicitly started. */
export const InspectionNativeLive = Layer.effect(InspectionNative, InspectionNative.make);

/**
 * Binds one native server and owns every operation fiber within its lifetime.
 * @param options - Validated bind address and ephemeral/fixed port.
 * @param handler - Effect handler with captured service authority and no hidden R.
 * @returns Actual endpoint; caller Scope owns listener and joined request cleanup.
 */
const listenInspection: InspectionNativeOperations["listen"] = (options, handler) =>
  Effect.gen(function* () {
    const run = yield* FiberSet.makeRuntimePromise<never, Response, never>();
    const responses = yield* Scope.make();
    const server = yield* Effect.acquireRelease(
      connectionAttempt("listener.bind", () =>
        Promise.resolve(
          Bun.serve({
            hostname: options.host,
            port: options.port,
            // Control readers bound their bytes; streamed app requests use the application's limits.
            maxRequestBodySize: Infinity,
            fetch: (request) =>
              run(
                handler(request).pipe(
                  Effect.flatMap((response) => ownInspectionResponse(response, responses)),
                ),
                { signal: request.signal },
              ),
          }),
        ),
      ).pipe(
        Effect.onExit((exit) =>
          Exit.isFailure(exit) ? Scope.close(responses, exit) : Effect.void,
        ),
      ),
      (server) =>
        Scope.close(responses, Exit.void).pipe(
          Effect.andThen(connectionAttempt("listener.close", () => server.stop(true))),
          Effect.catchTag("InspectionConnectionError", () =>
            Effect.logWarning("Inspection listener cleanup failed"),
          ),
        ),
    );
    const host = options.host === "0.0.0.0" || options.host === "::" ? "127.0.0.1" : options.host;
    const hostname = host.includes(":") ? `[${host}]` : host;
    return `http://${hostname}:${server.port}`;
  });

/**
 * Forwards once to the captured generation without changing mutation identity.
 * @param target - Committed generation captured before reading/forwarding the request.
 * @param request - Authenticated bounded request; cookies and native action IDs survive.
 * @returns Application response stream; cancellation follows the incoming request.
 */
const forwardInspection: InspectionNativeOperations["forward"] = (target, request) =>
  Effect.tryPromise({
    try: async (signal) => {
      const incoming = new URL(request.url);
      const destination = new URL(`${incoming.pathname}${incoming.search}`, target.endpoint);
      if (destination.origin !== new URL(target.endpoint).origin)
        throw new Error("Inspection route must remain on the selected application origin");
      const headers = new Headers(request.headers);
      headers.set("host", destination.host);
      headers.delete("connection");
      headers.delete("transfer-encoding");
      const response = await fetch(destination, {
        method: request.method,
        headers,
        ...(request.body === null ? {} : { body: request.body, duplex: "half" }),
        redirect: "manual",
        signal: AbortSignal.any([signal, request.signal]),
      });
      const responseHeaders = new Headers(response.headers);
      responseHeaders.delete("content-encoding");
      responseHeaders.delete("content-length");
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    },
    catch: (cause) =>
      new InspectionConnectionError({
        operation: "generation.forward",
        cause:
          cause instanceof Error ? cause : new Error("Inspection forwarding failed", { cause }),
      }),
  });
