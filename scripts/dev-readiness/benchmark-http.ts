/**
 * Owns bounded HTTP observations and an untimed exclusive-port precondition.
 * Existing serving traffic is never accepted as a new start. Response readers
 * close on success, overflow or cancellation, and native settlement is joined.
 */
import { Cause, Effect } from "effect";
import { createServer } from "node:net";
import { ownedNativePromise } from "@relkit/cli/internal/tooling";
import { ReadinessBenchmarkError } from "./benchmark-error.js";
import type { StartRequest } from "./benchmark.types.js";

/**
 * Proves the measured loopback port is free before reading the launch clock.
 * @param request - Exact backend URL; remote hosts are ineligible for this harness.
 * @returns Joined temporary listener release or a typed precondition failure.
 */
export const preflightBenchmarkPort = Effect.fn("ReadinessBenchmark.preflight")(function* (
  request: StartRequest,
) {
  yield* Effect.scoped(
    Effect.gen(function* () {
      const server = yield* Effect.acquireRelease(
        ownedNativePromise("benchmark.preflight", async () => {
          const url = new URL(request.url);
          if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.port === "")
            throw new Error("Measured backend must use an explicit loopback port");
          return await new Promise<ReturnType<typeof createServer>>((resolve, reject) => {
            const server = createServer((socket) => socket.destroy());
            server.once("error", reject);
            server.listen({ host: "127.0.0.1", port: Number(url.port), exclusive: true }, () => {
              server.removeListener("error", reject);
              resolve(server);
            });
          });
        }).pipe(
          Effect.catchCause((cause) =>
            Effect.failCause(
              Cause.map(
                cause,
                (error) =>
                  new ReadinessBenchmarkError({
                    operation: "preflight",
                    cause: new Error("Readiness requires a free backend port", { cause: error }),
                  }),
              ),
            ),
          ),
        ),
        (server) =>
          Effect.promise(
            () =>
              new Promise<void>((resolve, reject) =>
                server.close((error) => (error === undefined ? resolve() : reject(error))),
              ),
          ),
      );
      if (server.address() === null)
        return yield* new ReadinessBenchmarkError({
          operation: "preflight",
          cause: new Error("Readiness preflight did not bind a backend port"),
        });
    }),
  );
});

/**
 * Reads complete bounded bytes; connection absence alone permits another poll.
 * @param url - Previously validated loopback backend URL.
 * @returns A complete response or absence for a refused/reset/deadline transport.
 */
export const probeBenchmarkResponse = Effect.fn("ReadinessBenchmark.probe")((url: string) =>
  ownedNativePromise("benchmark.probe", async (signal) => {
    const response = await fetch(url, {
      // Keep the observation alive across candidate verification. The public
      // listener may retain this exact request until atomic publication.
      signal: AbortSignal.any([signal, AbortSignal.timeout(5_000)]),
      redirect: "manual",
    });
    return { status: response.status, body: await boundedBody(response) };
  }).pipe(
    Effect.catchCause((cause) => {
      const reason = cause.reasons[0];
      if (
        cause.reasons.length === 1 &&
        reason?._tag === "Fail" &&
        connectionUnavailable(reason.error.cause)
      )
        return Effect.succeed(undefined);
      return Effect.failCause(
        Cause.map(
          cause,
          (error) =>
            new ReadinessBenchmarkError({
              operation: "probe",
              cause: new Error("Readiness probe failed", { cause: error }),
            }),
        ),
      );
    }),
  ),
);

/**
 * Collects at most 64 KiB through EOF and joins owned reader cancellation.
 * @param response - Fetch response whose body belongs exclusively to this call.
 * @returns Full UTF-8 response; partial or oversized content cannot pass.
 */
async function boundedBody(response: Response): Promise<string> {
  if (response.body === null) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) return Buffer.concat(chunks).toString("utf8");
      bytes += next.value.byteLength;
      if (bytes > 65_536) throw new Error("Readiness response exceeds 64 KiB");
      chunks.push(next.value);
    }
  } finally {
    try {
      await reader.cancel();
    } finally {
      reader.releaseLock();
    }
  }
}

/**
 * Classifies native transport absence without recovering application or reader faults.
 * @typeParam T - Native rejection retained by the owned Promise boundary.
 * @param cause - Original fetch rejection, before adapter translation.
 * @returns Whether a later bounded poll may observe a newly serving backend.
 */
function connectionUnavailable<T>(cause: T): boolean {
  if (!(cause instanceof Error)) return false;
  if (cause.name === "TimeoutError") return true;
  return (
    "code" in cause &&
    ["ECONNREFUSED", "ECONNRESET", "ConnectionRefused"].includes(String(cause.code))
  );
}
