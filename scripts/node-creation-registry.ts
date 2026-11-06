/**
 * Serves a prepared packed candidate as an npm registry on Node or Bun, with `node:http` and the
 * same request handling as the Bun fixture registry (`packed-registry-runtime.ts`): candidate
 * packages from `index.json` and `tarballs/`, every other package from npmjs. The Node creation
 * smoke bundles it, so a job without Bun can install the candidate.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { registryResponse, registryUpstream } from "./packed-registry-runtime.js";
import type { Manifest } from "./scaffold-process.types.js";

/** Candidate metadata written by `node-creation-smoke.ts prepare`. */
export interface PreparedRegistryIndex {
  /** Every workspace package name; unpacked ones answer 404 instead of reaching npmjs. */
  readonly workspace: readonly string[];
  /** Verified packed manifests by package name; each tarball is `tarballs/<index>.tgz`. */
  readonly packages: readonly { readonly manifest: Manifest; readonly tarball: string }[];
}

/** A listening registry. */
export interface PreparedRegistry {
  readonly url: string;
  readonly close: () => Promise<void>;
}

/**
 * Starts the registry on a free loopback port.
 * @param directory - Prepared directory holding `index.json` and `tarballs/`.
 * @returns Its URL and a close function.
 */
export async function startPreparedRegistry(directory: string): Promise<PreparedRegistry> {
  const index = JSON.parse(
    await readFile(join(directory, "index.json"), "utf8"),
  ) as PreparedRegistryIndex;
  const bytes = new Map<string, Uint8Array>();
  const manifests = new Map<string, Manifest>();
  for (const entry of index.packages) {
    manifests.set(entry.manifest.name, entry.manifest);
    bytes.set(entry.manifest.name, await readFile(join(directory, entry.tarball)));
  }
  const packages = { bytes, manifests, workspace: new Set(index.workspace) };
  const upstream = registryUpstream();
  let port = 0;
  const server = createServer((request, response) => {
    void respond(request, response, (web) => registryResponse(web, port, packages, upstream));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  port = typeof address === "object" && address !== null ? address.port : 0;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

/**
 * Bridges one Node request to the fetch-style handler.
 * @param request - Node request.
 * @param response - Node response.
 * @param handle - Fetch-style handler.
 * @returns Completion once the response is written.
 */
async function respond(
  request: IncomingMessage,
  response: ServerResponse,
  handle: (request: Request) => Response | Promise<Response>,
): Promise<void> {
  try {
    const url = `http://${request.headers.host ?? "127.0.0.1"}${request.url ?? "/"}`;
    const answer = await handle(new Request(url, { method: request.method ?? "GET" }));
    response.writeHead(answer.status, Object.fromEntries(answer.headers));
    response.end(Buffer.from(await answer.arrayBuffer()));
  } catch (cause) {
    response.writeHead(500, { "content-type": "text/plain" });
    response.end(cause instanceof Error ? cause.message : String(cause));
  }
}
