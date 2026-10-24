/** Reads and packs first-party release identities and owns the bounded candidate fixture registry listener. */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { runCommand, type Manifest } from "./pack-and-smoke-create-relkit-support.js";
import { workspacePackageDirectories } from "./workspace-packages.js";
import { registryPackages, registryResponse, registryUpstream } from "./packed-registry-runtime.js";
import { packingWorkspaceClosure } from "./packing-workspace-closure.js";

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

/**
 * Reads the current first-party package identities and their owning workspace directories.
 * @param root - Repository root defining the current workspace package set.
 * @returns Current workspace manifests indexed by package name with their physical source roots.
 */
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

/**
 * Builds and packs the fixture package closure sequentially into its owned artifact directory.
 * @param temporary - Owned directory receiving this packing run and its artifacts.
 * @param manifests - Current workspace release package identities and source locations.
 * @returns Freshly built tarball paths indexed by package name after sequential packing completes.
 */
export async function packPackages(
  temporary: string,
  manifests: Map<string, { directory: string; manifest: Manifest }>,
): Promise<Map<string, string>> {
  const names = packingWorkspaceClosure(
    [
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
    ],
    manifests,
  );
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

/**
 * Loads exact candidate archive locations from the fresh release manifest.
 * @param directory - Fresh release directory containing its tarball manifest.
 * @returns Candidate archive paths from the release manifest indexed by package name.
 */
export async function loadReleaseTarballs(directory: string): Promise<Map<string, string>> {
  const manifest = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8")) as {
    packages: { name: string; file: string }[];
  };
  const root = resolve(directory);
  return new Map(
    manifest.packages.map((item) => {
      const archive = resolve(root, item.file);
      const local = relative(root, archive);
      if (
        isAbsolute(item.file) ||
        local === ".." ||
        local.startsWith("../") ||
        isAbsolute(local) ||
        !local.endsWith(".tgz")
      )
        throw new TypeError("Release archive must remain inside its manifest directory");
      return [item.name, archive];
    }),
  );
}

/**
 * Starts one owned fixture listener with verified candidate metadata.
 * @param root - Owned acceptance fixture or relocated application root.
 * @param tarballs - Candidate archive paths indexed by their first-party package name.
 * @param manifests - Current workspace release package identities and source locations.
 * @returns The owned Bun listener; the caller stops it after all fixture installations settle.
 */
export async function startRegistry(
  root: string,
  tarballs: Map<string, string>,
  manifests: Map<string, { directory: string; manifest: Manifest }>,
): Promise<ReturnType<typeof Bun.serve>> {
  const packages = await registryPackages(tarballs, manifests, readPackedManifest);
  const upstream = registryUpstream();
  let port = 0;
  const server = Bun.serve({
    hostname: "0.0.0.0",
    port: 0,
    idleTimeout: 120,
    fetch: (request) => registryResponse(request, port, packages, upstream),
  });
  port = server.port ?? 0;
  if (port === 0) throw new Error("Registry did not allocate a port.");
  await writeFile(join(root, ".npmrc"), "registry=http://127.0.0.1:" + port + "\n");
  return server;
}
