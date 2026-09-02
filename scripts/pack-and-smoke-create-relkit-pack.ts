import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runCommand, type Manifest } from "./pack-and-smoke-create-relkit-support.js";
import { workspacePackageDirectories } from "./workspace-packages.js";

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
  for (const [name, path] of tarballs) bytes.set(name, await readFile(path));
  let port = 0;
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      const path = decodeURIComponent(url.pathname.slice(1));
      const name = path.startsWith("_tar/") ? path.slice(5) : path;
      if (path.startsWith("_tar/") && bytes.has(name))
        return new Response(Buffer.from(bytes.get(name)!), {
          headers: { "content-type": "application/octet-stream" },
        });
      const manifest = manifests.get(name)?.manifest;
      if (manifest === undefined || !bytes.has(name))
        return fetch(`https://registry.npmjs.org${url.pathname}${url.search}`).then(
          async (response) =>
            new Response(await response.arrayBuffer(), {
              status: response.status,
              headers: {
                "content-type": response.headers.get("content-type") ?? "application/json",
              },
            }),
        );
      const dependencies = Object.fromEntries(
        Object.entries(manifest.dependencies ?? {}).map(([key, value]) => [
          key,
          value.startsWith("workspace:") ? manifest.version : value,
        ]),
      );
      return Response.json({
        name,
        "dist-tags": { latest: manifest.version },
        versions: {
          [manifest.version]: {
            ...manifest,
            dependencies,
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
