/**
 * Reuses the candidate-only first-party registry and measures tarball transfers
 * through a scope-owned loopback proxy. Candidate metadata cannot fall back to
 * published first-party versions; responses stream without retaining archives.
 */
import { Effect, Schema } from "effect";
import { startRegistry } from "./pack-and-smoke-create-relkit-pack.js";
import { inspectionNative } from "./consumer-installation-native.js";
import { exactVersion } from "./catalog-manifest.js";
import type { Manifest } from "./scaffold-process.types.js";
import type { ConsumerArchive, ConsumerRegistry } from "./consumer-registry.types.js";

/**
 * Resolves a tarball URL to the exact archive identity it represents.
 * @param pathname - Decoded registry-relative request path.
 * @param manifests - Candidate identities already checked by the existing registry.
 * @returns Its package/version identity, or undefined for non-archive metadata.
 */
function archiveIdentity(
  pathname: string,
  manifests: ReadonlyMap<string, { readonly manifest: Manifest }>,
) {
  if (pathname.startsWith("/_tar/")) {
    const name = decodeURIComponent(pathname.slice(6)),
      version = manifests.get(name)?.manifest.version;
    if (version !== undefined) return { name, version };
  }
  const split = pathname.indexOf("/-/");
  if (split < 0 || !pathname.endsWith(".tgz")) return;
  const name = decodeURIComponent(pathname.slice(1, split));
  const filename = pathname.slice(split + 3);
  const basename = name.split("/").at(-1);
  if (basename === undefined || !filename.startsWith(basename + "-")) return;
  const version = filename.slice(basename.length + 1, -4);
  if (exactVersion(version)) return { name, version };
}

/**
 * Streams one archive while counting the bytes actually delivered to the consumer.
 * @param response - Owned upstream response with a finite registry timeout.
 * @param identity - Version identity derived from the actual tarball request.
 * @param complete - Records a fully consumed compressed archive.
 * @param transferred - Counts partial as well as complete transfers.
 * @returns A streaming response; incomplete transfers never become full archive measurements.
 */
function measuredResponse(
  response: Response,
  identity: { readonly name: string; readonly version: string },
  complete: (value: ConsumerArchive) => void,
  transferred: (bytes: number) => void,
) {
  if (response.body === null) return response;
  let bytes = 0;
  const counted = response.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        bytes += chunk.byteLength;
        transferred(chunk.byteLength);
        controller.enqueue(chunk);
      },
      flush() {
        complete({ ...identity, bytes });
      },
    }),
  );
  return new Response(counted, { status: response.status, headers: response.headers });
}

/**
 * Routes archive URLs back through measurement without changing integrity data.
 * @param value - Decoded registry metadata.
 * @param origin - Scoped measuring registry origin.
 * @returns Metadata preserving every value except its tarball transport address.
 */
function measuredMetadata(value: Schema.Json, origin: string): Schema.Json {
  if (Array.isArray(value)) return value.map((item) => measuredMetadata(item, origin));
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => {
      if (key === "tarball" && typeof child === "string") {
        const url = new URL(child);
        return [key, `${origin}${url.pathname}${url.search}`];
      }
      return [key, measuredMetadata(child, origin)];
    }),
  );
}

/**
 * Rewrites packument URLs so package managers cannot bypass byte measurement.
 * @param response - Registry metadata, never a tarball.
 * @param origin - Actual scope-owned proxy address.
 * @returns Equivalent decoded metadata using the measuring transport.
 */
async function metadataResponse(response: Response, origin: string) {
  const text = await response.text();
  const value = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Json))(text);
  return Response.json(measuredMetadata(value, origin), { status: response.status });
}

/**
 * Acquires candidate registry and measuring proxy with joined listener shutdown.
 * @param root - Measurement-owned directory for registry configuration.
 * @param tarballs - Exact candidate artifacts supplied to the existing registry.
 * @param manifests - Current candidate identities, including all first-party names.
 * @returns A scoped registry with unique archive measurements and transfer totals.
 */
export const consumerRegistry = Effect.fn("ConsumerRegistry.acquire")(function* (
  root: string,
  tarballs: Map<string, string>,
  manifests: Map<string, { directory: string; manifest: Manifest }>,
) {
  const upstream = yield* Effect.acquireRelease(
    inspectionNative("registry.acquire", () => startRegistry(root, tarballs, manifests)),
    (server) => Effect.promise(() => server.stop(true)),
  );
  const archives = new Map<string, ConsumerArchive>();
  let transferred = 0,
    origin = "";
  const proxy = yield* Effect.acquireRelease(
    Effect.sync(() =>
      Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        idleTimeout: 120,
        async fetch(request) {
          const path = new URL(request.url);
          const response = await fetch(
            `http://127.0.0.1:${upstream.port}${path.pathname}${path.search}`,
            { signal: request.signal },
          );
          const identity = archiveIdentity(path.pathname, manifests);
          if (!response.ok) return response;
          if (identity === undefined) return metadataResponse(response, origin);
          return measuredResponse(
            response,
            identity,
            (value) => archives.set(`${value.name}@${value.version}`, value),
            (bytes) => {
              transferred += bytes;
            },
          );
        },
      }),
    ),
    (server) => Effect.promise(() => server.stop(true)),
  );
  origin = `http://127.0.0.1:${proxy.port}`;
  return { url: origin, archives, transferredBytes: () => transferred } satisfies ConsumerRegistry;
});
