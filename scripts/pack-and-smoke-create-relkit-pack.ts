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
  const child = Bun.spawn(["tar", "-xOf", path, "package/package.json"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) throw new Error(`Cannot read packed manifest ${path}\n${stderr}`);
  return JSON.parse(stdout) as Manifest;
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
  const workspaceNames = new Set(manifests.keys());
  for (const [name, path] of tarballs) {
    const packed = await readPackedManifest(path);
    const source = manifests.get(name)?.manifest;
    if (source === undefined || packed.name !== name || packed.version !== source.version)
      throw new Error(`Packed registry identity mismatch: ${name}`);
    assertPackedDependencies(source, packed, rootManifest, workspaceNames, packed.version);
    packedManifests.set(name, packed);
    bytes.set(name, await readFile(path));
  }
  const upstreamResponses = new Map<
    string,
    Promise<{ body: Uint8Array; contentType: string; status: number }>
  >();
  const proxyUpstream = async (url: URL): Promise<Response> => {
    const load = async () => {
      const response = await fetch(`https://registry.npmjs.org${url.pathname}${url.search}`);
      return {
        body: new Uint8Array(await response.arrayBuffer()),
        contentType: response.headers.get("content-type") ?? "application/json",
        status: response.status,
      };
    };
    const key = `${url.pathname}${url.search}`;
    const result = await (upstreamResponses.get(key) ??
      (() => {
        const pending = load();
        upstreamResponses.set(key, pending);
        return pending;
      })());
    return new Response(result.body.slice(), {
      status: result.status,
      headers: { "content-type": result.contentType },
    });
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
      if (manifest === undefined) return proxyUpstream(url);
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
