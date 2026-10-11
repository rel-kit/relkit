/**
 * Owns a real ephemeral loopback listener for protected probe transport tests.
 * Header observations remain test-local; shutdown closes all sockets and joins
 * native close settlement before the test Scope returns.
 */
import { createServer } from "node:http";
import { Effect } from "effect";
import { ownedNativePromise } from "../../src/services/owned-promise.js";

/**
 * Acquires a listener recording authorization and offering a redirect fault.
 * @param received - Test-owned ordered observations; no runtime secret is read.
 * @returns Ephemeral loopback base URL in the caller's Scope.
 */
export const authProbeListener = Effect.fn("GraphProofTest.listener")(function* (
  received: string[],
) {
  const server = yield* Effect.acquireRelease(
    ownedNativePromise(
      "test.probe.listen",
      () =>
        new Promise<ReturnType<typeof createServer>>((resolve, reject) => {
          const server = createServer((request, response) => {
            received.push(request.headers.authorization ?? "absent");
            if (request.url?.endsWith("/redirect")) {
              response.writeHead(302, { location: "/hello" });
              response.end();
            } else response.end("complete");
          });
          server.once("error", reject);
          server.listen(0, "127.0.0.1", () => resolve(server));
        }),
    ),
    (server) =>
      ownedNativePromise(
        "test.probe.stop",
        () =>
          new Promise<void>((resolve, reject) => {
            server.closeAllConnections();
            server.close((error) => (error === undefined ? resolve() : reject(error)));
          }),
      ).pipe(Effect.orDie),
  );
  const address = server.address();
  if (address === null || typeof address === "string")
    return yield* Effect.die(new Error("Probe test listener did not bind a numeric port."));
  return `http://127.0.0.1:${address.port}`;
});
