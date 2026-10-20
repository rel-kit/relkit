import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { runCommand, type Manifest } from "./pack-and-smoke-create-relkit-support.js";
import { workspacePackageDirectories } from "./workspace-packages.js";
import { assertPackedDependencies } from "./catalog-manifest.js";

/**
 * Reads package metadata from the artifact that consumers actually install.
 * @param path - Package tarball path.
 * @returns Its package manifest.
 * @throws When extraction fails or the manifest is malformed JSON.
 */
export async function readPackedManifest(path: string): Promise<Manifest> {
  const files = await new Bun.Archive(await Bun.file(path).bytes()).files("package/package.json");
  const manifest = files.get("package/package.json");
  if (manifest === undefined) throw new Error(`Packed manifest is absent: ${path}`);
  return JSON.parse(await manifest.text()) as Manifest;
}

export async function readManifests(
  root: string,
): Promise<Map<string, { directory: string; manifest: Manifest }>> {
  const result = new Map<string, { directory: string; manifest: Manifest }>();
  for (const directory of workspacePackageDirectories(root)) {
    const manifest = JSON.parse(
      await readFile(join(directory, "package.json"), "utf8"),
    ) as Manifest;
    result.set(manifest.name, { directory, manifest });
  }
  return result;
}

export async function packPackages(
  temporary: string,
  manifests: Map<string, { directory: string; manifest: Manifest }>,
): Promise<Map<string, string>> {
  const names = [
    "relkit",
    "@relkit/cli",
    "@relkit/app",
    "@relkit/config",
    "@relkit/schema",
    "@relkit/testing",
    "create-relkit",
    "@relkit/local",
    "@relkit/docker",
    "@relkit/inngest",
    "@relkit/effect-mq",
    "@relkit/trigger",
    "@relkit/redis",
    "@relkit/s3",
  ];
  for (let index = 0; index < names.length; index += 1)
    for (const dependency of Object.keys(manifests.get(names[index]!)?.manifest.dependencies ?? {}))
      if (manifests.has(dependency) && !names.includes(dependency)) names.push(dependency);
  const result = new Map<string, string>();
  for (const name of names) {
    const packageInfo = manifests.get(name);
    if (packageInfo === undefined) throw new Error(`Missing workspace package ${name}`);
    const directory = join(temporary, "artifacts", name.replaceAll("/", "-"));
    await mkdir(directory, { recursive: true });
    await runCommand(["run", "build"], packageInfo.directory);
    await runCommand(
      ["pm", "pack", "--ignore-scripts", "--destination", directory, "--quiet"],
      packageInfo.directory,
    );
    const files = (await readdir(directory)).filter((file) => file.endsWith(".tgz"));
    if (files.length !== 1 || files[0] === undefined)
      throw new Error(`Expected one tarball for ${name}`);
    result.set(name, join(directory, files[0]));
  }
  return result;
}

export async function loadReleaseTarballs(directory: string): Promise<Map<string, string>> {
  const manifest = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8")) as {
    packages: { name: string; file: string }[];
  };
  return new Map(manifest.packages.map((item) => [item.name, join(directory, item.file)]));
}

export async function startRegistry(
  root: string,
  tarballs: Map<string, string>,
  manifests: Map<string, { directory: string; manifest: Manifest }>,
): Promise<ReturnType<typeof Bun.serve>> {
  const bytes = new Map<string, Uint8Array>();
  const packedManifests = new Map<string, Manifest>();
  const rootManifest = JSON.parse(
    await readFile(resolve(import.meta.dir, "../package.json"), "utf8"),
  );
  const workspaceVersions = new Map(
    [...manifests].map(([name, item]) => [name, item.manifest.version]),
  );
  for (const [name, path] of tarballs) {
    const packed = await readPackedManifest(path);
    const source = manifests.get(name)?.manifest;
    if (source === undefined || packed.name !== name || packed.version !== source.version)
      throw new Error(`Packed registry identity mismatch: ${name}`);
    assertPackedDependencies(source, packed, rootManifest, workspaceVersions);
    packedManifests.set(name, packed);
    bytes.set(name, await readFile(path));
  }
  const upstreamResponses = new Map<
    string,
    Promise<{ body: Uint8Array<ArrayBuffer>; contentType: string; status: number }>
  >();
  const proxyUpstream = async (url: URL): Promise<Response> => {
    const load = async () => {
      const response = await fetch(`https://registry.npmjs.org${url.pathname}${url.search}`, {
        signal: AbortSignal.timeout(60_000),
        headers: { accept: "application/vnd.npm.install-v1+json" },
      });
      return {
        body: new Uint8Array(await response.arrayBuffer()),
        contentType: response.headers.get("content-type") ?? "application/json",
        status: response.status,
      };
    };
    const key = `${url.pathname}${url.search}`;
    const pending =
      upstreamResponses.get(key) ??
      (() => {
        const pending = load();
        upstreamResponses.set(key, pending);
        void pending.catch(() => {
          if (upstreamResponses.get(key) === pending) upstreamResponses.delete(key);
        });
        return pending;
      })();
    try {
      const result = await pending;
      return new Response(result.body, {
        status: result.status,
        headers: { "content-type": result.contentType },
      });
    } finally {
      // Deduplicate active transfers without retaining every npm tarball/packument in RAM.
      if (upstreamResponses.get(key) === pending) upstreamResponses.delete(key);
    }
  };
  let port = 0;
  const server = Bun.serve({
    port: 0,
    idleTimeout: 120,
    fetch(request) {
      const url = new URL(request.url);
      const path = decodeURIComponent(url.pathname.slice(1));
      const name = path.startsWith("_tar/") ? path.slice(5) : path;
      if (path.startsWith("_tar/") && bytes.has(name))
        return new Response(Buffer.from(bytes.get(name)!), {
          headers: { "content-type": "application/octet-stream" },
        });
      const manifest = packedManifests.get(name);
      if (manifests.has(name) && manifest === undefined)
        return new Response(`Workspace package was not packed: ${name}`, { status: 404 });
      if (manifest === undefined)
        return proxyUpstream(url).catch(
          () => new Response("Upstream npm registry unavailable", { status: 502 }),
        );
      return Response.json({
        name,
        "dist-tags": { latest: manifest.version },
        versions: {
          [manifest.version]: {
            ...manifest,
            dist: { tarball: `http://127.0.0.1:${port}/_tar/${encodeURIComponent(name)}` },
          },
        },
      });
    },
  });
  port = server.port ?? 0;
  if (port === 0) throw new Error("Registry did not allocate a port.");
  await writeFile(join(root, ".npmrc"), `registry=http://127.0.0.1:${port}\n`);
  return server;
}
