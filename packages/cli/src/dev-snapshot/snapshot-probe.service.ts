/**
 * Owns one bounded native readiness request. The complete response counts as
 * proof; body size and a five-second deadline are enforced during streaming.
 * Interruption aborts and physically joins fetch/read settlement before release.
 */
import { Context, Effect, Layer } from "effect";
import { ownedNativePromise } from "../services/owned-promise.js";
import { snapshotProbeHeaders } from "./snapshot-http-auth.js";
import type { SnapshotProbeOperations } from "./snapshot-candidate.types.js";

/** Native HTTP adapter acquires no sockets until a probe operation executes. */
export class SnapshotProbe extends Context.Service<SnapshotProbe, SnapshotProbeOperations>()(
  "relkit/DevSnapshot/Probe",
  {
    make: Effect.sync(() => makeSnapshotProbeOperations(fetch, pause)),
  },
) {}

/** Bun fetch adapter; contract tests provide the same service through a deterministic Layer. */
export const snapshotProbeLive = Layer.succeed(
  SnapshotProbe,
  makeSnapshotProbeOperations(fetch, pause),
);

/**
 * Constructs the HTTP adapter with injectable request and retry timing.
 * @param fetcher - Native Fetch boundary used for loopback requests.
 * @param sleep - Bounded retry delay; tests replace it without wall-clock waiting.
 * @returns Snapshot probe operations with one owned request per invocation.
 */
export function makeSnapshotProbeOperations(
  fetcher: typeof fetch,
  sleep: (milliseconds: number) => Promise<void>,
): SnapshotProbeOperations {
  return { read: readProbe(fetcher, sleep), forward: forwardProbe(fetcher, sleep) };
}

/**
 * Requests the exact prepared path on an unpublished loopback child.
 * @param port - SDK-owned candidate port, never a caller-supplied remote authority.
 * @param path - Schema-decoded backend route with no scheme/authority escape.
 * @param signal - Activation cancellation combined with adapter interruption and deadline.
 * @returns Complete bounded HTTP result or typed native failure.
 */
function readProbe(fetcher: typeof fetch, sleep: (milliseconds: number) => Promise<void>) {
  return Effect.fn("DevSnapshot.readProbe")((port: number, path: string, signal: AbortSignal) =>
    ownedNativePromise("dev.snapshot.probe.http", async (owned) => {
      const target = new URL(`http://127.0.0.1:${port}${path}`);
      const request = new Request(target.href, {
        headers: snapshotProbeHeaders(path, process.env.RELKIT_INTERNAL_ENDPOINT_TOKEN),
      });
      const response = await fetchWhenListening(
        fetcher,
        sleep,
        target,
        request,
        AbortSignal.any([signal, owned, AbortSignal.timeout(5_000)]),
      );
      return { status: response.status, body: await readBoundedBody(response) };
    }),
  );
}

/** Forwards the already-waiting public request to the unpublished private child. */
function forwardProbe(fetcher: typeof fetch, sleep: (milliseconds: number) => Promise<void>) {
  return Effect.fn("DevSnapshot.forwardProbe")(
    (port: number, request: Request, signal: AbortSignal) =>
      ownedNativePromise("dev.snapshot.probe.forward", async (owned) => {
        const target = new URL(request.url);
        target.hostname = "127.0.0.1";
        target.port = String(port);
        const combined = AbortSignal.any([
          signal,
          owned,
          request.signal,
          AbortSignal.timeout(5_000),
        ]);
        const response = await fetchWhenListening(fetcher, sleep, target, request, combined);
        const body = await readBoundedBody(response);
        return {
          status: response.status,
          body,
          response: new Response(body, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          }),
        };
      }),
  );
}

/** Polls the unpublished socket while the supervisor performs its parallel health proof. */
async function fetchWhenListening(
  fetcher: typeof fetch,
  sleep: (milliseconds: number) => Promise<void>,
  target: URL,
  request: Request,
  signal: AbortSignal,
): Promise<Response> {
  while (true) {
    try {
      return await fetcher(target, {
        method: request.method,
        headers: request.headers,
        signal,
        redirect: "error",
      });
    } catch (error) {
      if (signal.aborted) throw signal.reason ?? error;
      await sleep(5);
    }
  }
}

function pause(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * Collects at most 64 KiB and closes the owned reader on success or failure.
 * @param response - Native fetch response owned by the probe call.
 * @returns Complete UTF-8 body; oversized or incomplete streaming cannot pass readiness.
 * @throws Native read/size failure, retained by the typed HTTP adapter.
 */
async function readBoundedBody(response: Response): Promise<string> {
  if (response.body === null) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) return Buffer.concat(chunks).toString("utf8");
      bytes += next.value.byteLength;
      if (bytes > 65_536) throw new Error("Prepared readiness response exceeds its bound.");
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
