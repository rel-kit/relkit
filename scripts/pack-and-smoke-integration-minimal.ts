import { access, cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

interface PackedManifest {
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly exports?: Readonly<Record<string, unknown>>;
}

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

export async function smokeMinimalIntegrationInstalls(
  root: string,
  repositoryRoot: string,
  packageDirectories: readonly string[],
  integrationNames: ReadonlySet<string>,
  manifests: ReadonlyMap<string, PackedManifest>,
  tarballs: ReadonlyMap<string, string>,
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
    await importPublicEntries(fixture, name, manifests.get(name)?.exports);
  }
  return integrationNames.size;
}

export async function copyExternalDependencies(
  fixture: string,
  dependencies: ReadonlySet<string>,
  repositoryRoot: string,
  packageDirectories: readonly string[],
): Promise<void> {
  for (const dependency of [...dependencies].sort()) {
    const candidates = [
      join(repositoryRoot, "node_modules", ...dependency.split("/")),
      ...packageDirectories.map((directory) =>
        join(directory, "node_modules", ...dependency.split("/")),
      ),
    ];
    let source: string | undefined;
    for (const candidate of candidates) {
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
  }
}

function workspaceClosure(
  root: string,
  manifests: ReadonlyMap<string, PackedManifest>,
): Set<string> {
  const names = [root];
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
  exports: Readonly<Record<string, unknown>> | undefined,
): Promise<void> {
  const entries = Object.keys(exports ?? {}).map((key) =>
    key === "." ? packageName : `${packageName}${key.slice(1)}`,
  );
  const child = Bun.spawn(
    [
      "node",
      "--input-type=module",
      "--eval",
      "for (const entry of JSON.parse(process.argv[1])) await import(entry);",
      JSON.stringify(entries),
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
