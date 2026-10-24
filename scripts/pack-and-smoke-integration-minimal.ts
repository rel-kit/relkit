/** Proves peer-free authoring before loading selected public runtime entries with their real native peers. */
import { access, cp, mkdir, readFile, realpath, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { PackageExportManifest as PackedManifest } from "./pack-export.types.js";

export async function unpackTarball(tarball: string, target: string): Promise<void> {
  await mkdir(target, { recursive: true });
  const child = Bun.spawn(["tar", "-xzf", tarball, "--strip-components=1", "-C", target], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const stderr = await new Response(child.stderr).text();
  if ((await child.exited) !== 0)
    throw new Error(`tar extraction failed for ${tarball}\n${stderr}`);
}

/**
 * Checks SDK-free descriptor roots before importing all selected public leaves with real peers.
 * @param root - Owned independent integration consumers.
 * @param repositoryRoot - Read-only generic dependency copy authority for authoring checks.
 * @param packageDirectories - Native dependency search roots for those existing generic copies.
 * @param integrationNames - Exact independent integration cohort.
 * @param manifests - Validated first-party dependency and public-entry declarations.
 * @param tarballs - Required first-party archives, never workspace source links.
 * @param install - Captured real isolated installer for the selected runtime/testing leaves.
 * @returns The number of integrations whose complete public-entry assertions passed.
 */
export async function smokeMinimalIntegrationInstalls(
  root: string,
  repositoryRoot: string,
  packageDirectories: readonly string[],
  integrationNames: ReadonlySet<string>,
  manifests: ReadonlyMap<string, PackedManifest>,
  tarballs: ReadonlyMap<string, string>,
  install: (root: string, names: readonly string[]) => Promise<void>,
): Promise<number> {
  for (const name of [...integrationNames].sort()) {
    const closure = workspaceClosure(name, manifests);
    const unrelated = [...closure].filter(
      (dependency) => dependency !== name && integrationNames.has(dependency),
    );
    if (unrelated.length > 0)
      throw new Error(`${name} pulls unrelated integrations: ${unrelated.join(", ")}`);
    const fixture = join(root, name.replaceAll("/", "-"));
    for (const dependency of closure) {
      const tarball = tarballs.get(dependency);
      if (tarball === undefined) throw new Error(`Missing packed dependency ${dependency}`);
      await unpackTarball(tarball, join(fixture, "node_modules", ...dependency.split("/")));
    }
    await copyExternalDependencies(
      fixture,
      externalDependencies(closure, manifests),
      repositoryRoot,
      packageDirectories,
    );
    const manifest = manifests.get(name);
    const peers = Object.keys(manifest?.peerDependencies ?? {}).filter(
      (peer) => !manifests.has(peer) && !(peer in (manifest?.dependencies ?? {})),
    );
    // LangChain's authoring root is intrinsically native; descriptor-only owners remain SDK-free.
    if (name !== "@relkit/langchain")
      await importPublicEntries(fixture, name, { ".": manifest?.exports?.["."] ?? "" }, peers);
    try {
      await install(fixture, [name]);
      await importPublicEntries(fixture, name, manifest?.exports);
    } finally {
      await rm(join(fixture, "node_modules"), { recursive: true, force: true });
    }
  }
  return integrationNames.size;
}

export async function copyExternalDependencies(
  fixture: string,
  dependencies: ReadonlySet<string>,
  repositoryRoot: string,
  packageDirectories: readonly string[],
): Promise<void> {
  const pending = [...dependencies].sort();
  const copied = new Set<string>();
  const roots = [
    join(repositoryRoot, "node_modules"),
    ...packageDirectories.map((directory) => join(directory, "node_modules")),
  ];
  while (pending.length > 0) {
    const dependency = pending.shift()!;
    if (copied.has(dependency)) continue;
    let source: string | undefined;
    for (const root of roots) {
      const candidate = join(root, ...dependency.split("/"));
      try {
        await access(candidate);
        source = candidate;
        break;
      } catch {}
    }
    if (source === undefined) throw new Error(`Missing packed dependency ${dependency}`);
    const target = join(fixture, "node_modules", ...dependency.split("/"));
    await mkdir(dirname(target), { recursive: true });
    await cp(source, target, { recursive: true, dereference: true });
    copied.add(dependency);
    const resolved = await realpath(source);
    roots.push(
      dependency.startsWith("@") ? dirname(dirname(resolved)) : dirname(resolved),
      join(resolved, "node_modules"),
    );
    const manifest = JSON.parse(await readFile(join(resolved, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    };
    pending.push(...Object.keys(manifest.dependencies ?? {}).filter((name) => !copied.has(name)));
    for (const optional of Object.keys(manifest.optionalDependencies ?? {})) {
      if (copied.has(optional)) continue;
      for (const root of roots) {
        try {
          await access(join(root, ...optional.split("/")));
          pending.push(optional);
          break;
        } catch {}
      }
    }
  }
}

function workspaceClosure(
  root: string,
  manifests: ReadonlyMap<string, PackedManifest>,
): Set<string> {
  const names = [
    root,
    ...Object.keys(manifests.get(root)?.peerDependencies ?? {}).filter((peer) =>
      manifests.has(peer),
    ),
  ];
  for (let index = 0; index < names.length; index += 1) {
    for (const dependency of Object.keys(manifests.get(names[index]!)?.dependencies ?? {}))
      if (manifests.has(dependency) && !names.includes(dependency)) names.push(dependency);
  }
  return new Set(names.sort());
}

function externalDependencies(
  closure: ReadonlySet<string>,
  manifests: ReadonlyMap<string, PackedManifest>,
): Set<string> {
  const dependencies = new Set<string>();
  for (const name of closure)
    for (const dependency of Object.keys(manifests.get(name)?.dependencies ?? {}))
      if (!manifests.has(dependency)) dependencies.add(dependency);
  return dependencies;
}

async function importPublicEntries(
  cwd: string,
  packageName: string,
  exports: PackedManifest["exports"],
  absentPeers: readonly string[] = [],
): Promise<void> {
  const entries = Object.keys(exports ?? {}).map((key) =>
    key === "." ? packageName : `${packageName}${key.slice(1)}`,
  );
  const child = Bun.spawn(
    [
      "node",
      "--input-type=module",
      "--eval",
      `for (const peer of JSON.parse(process.argv[2])) {
        try { import.meta.resolve(peer); }
        catch (error) { if (error.code === "ERR_MODULE_NOT_FOUND") continue; throw error; }
        throw new Error("Unselected SDK is installed: " + peer);
      }
      for (const entry of JSON.parse(process.argv[1])) await import(entry);`,
      JSON.stringify(entries),
      JSON.stringify(absentPeers),
    ],
    { cwd, stdout: "pipe", stderr: "pipe" },
  );
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) throw new Error(`Minimal install failed for ${packageName}\n${stdout}${stderr}`);
}
