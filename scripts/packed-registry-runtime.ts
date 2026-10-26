/**
 * Serves verified candidate bytes through the local packed-consumer fixture registry.
 * The registry owner supplies workspace metadata and its allocated port; requests retain
 * only validated local origins, while third-party metadata uses bounded upstream transfers.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { assertPackedDependencies } from "./catalog-manifest.js";
import type { Manifest } from "./scaffold-process.types.js";
import type { Sources } from "./packed-registry-runtime.types.js";

/**
 * Reads candidate metadata and verifies it against the current release inputs.
 * @param tarballs - Candidate archive paths indexed by package name.
 * @param sources - Current workspace package identities and their source locations.
 * @param readManifest - Archive reader preserving the actual packed manifest.
 * @returns Verified manifests, archive bytes and the complete workspace package name set.
 */
export async function registryPackages(
  tarballs: ReadonlyMap<string, string>,
  sources: Sources,
  readManifest: (path: string) => Promise<Manifest>,
) {
  const bytes = new Map<string, Uint8Array>();
  const manifests = new Map<string, Manifest>();
  const root = JSON.parse(await readFile(resolve(import.meta.dirname, "../package.json"), "utf8"));
  const versions = new Map([...sources].map(([name, source]) => [name, source.manifest.version]));
  for (const [name, path] of tarballs) {
    const packed = await readManifest(path);
    const source = sources.get(name)?.manifest;
    if (source === undefined || packed.name !== name || packed.version !== source.version)
      throw new Error(`Packed registry identity mismatch: ${name}`);
    assertPackedDependencies(source, packed, root, versions);
    manifests.set(name, packed);
    bytes.set(name, await readFile(path));
  }
  return { bytes, manifests, workspace: new Set(sources.keys()) };
}

/**
 * Deduplicates active upstream transfers without retaining completed response bodies.
 * @returns A fixture upstream reader limited to npm with a 60-second transfer deadline.
 */
export function registryUpstream() {
  const responses = new Map<
    string,
    Promise<{
      body: Uint8Array<ArrayBuffer>;
      contentType: string;
      status: number;
    }>
  >();
  return async (url: URL): Promise<Response> => {
    const key = `${url.pathname}${url.search}`;
    const pending =
      responses.get(key) ??
      (async () => {
        const response = await fetch(`https://registry.npmjs.org${key}`, {
          signal: AbortSignal.timeout(60_000),
          headers: { accept: "application/vnd.npm.install-v1+json" },
        });
        return {
          body: new Uint8Array(await response.arrayBuffer()),
          contentType: response.headers.get("content-type") ?? "application/json",
          status: response.status,
        };
      })();
    responses.set(key, pending);
    try {
      const result = await pending;
      return new Response(result.body, {
        status: result.status,
        headers: { "content-type": result.contentType },
      });
    } finally {
      if (responses.get(key) === pending) responses.delete(key);
    }
  };
}

/**
 * Preserves the caller's validated local origin so Docker can fetch candidate tarballs.
 * @param request - Incoming fixture registry request with its original authority.
 * @param port - Actual port allocated by the owning local registry listener.
 * @param packages - Candidate metadata and bytes already verified against release sources.
 * @param upstream - Bounded third-party reader used only outside the workspace package set.
 * @returns Candidate bytes or metadata, a bounded upstream response, or an explicit rejection.
 */
export function registryResponse(
  request: Request,
  port: number,
  packages: Awaited<ReturnType<typeof registryPackages>>,
  upstream: ReturnType<typeof registryUpstream>,
): Response | Promise<Response> {
  const url = new URL(request.url);
  if (
    url.protocol !== "http:" ||
    url.port !== String(port) ||
    !["127.0.0.1", "localhost", "[::1]", "host.docker.internal"].includes(url.hostname)
  )
    return new Response("Invalid fixture registry authority", { status: 400 });
  const path = decodeURIComponent(url.pathname.slice(1));
  const name = path.startsWith("_tar/") ? path.slice(5) : path;
  if (path.startsWith("_tar/") && packages.bytes.has(name))
    return new Response(Buffer.from(packages.bytes.get(name)!), {
      headers: { "content-type": "application/octet-stream" },
    });
  const manifest = packages.manifests.get(name);
  if (packages.workspace.has(name) && manifest === undefined)
    return new Response(`Workspace package was not packed: ${name}`, { status: 404 });
  if (manifest === undefined)
    return upstream(url).catch(
      () => new Response("Upstream npm registry unavailable", { status: 502 }),
    );
  return Response.json({
    name,
    "dist-tags": { latest: manifest.version },
    versions: {
      [manifest.version]: {
        ...manifest,
        dist: { tarball: `${url.origin}/_tar/${encodeURIComponent(name)}` },
      },
    },
  });
}
