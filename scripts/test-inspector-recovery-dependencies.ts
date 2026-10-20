/** Materializes contained dependencies so prepared recovery cannot fall back on workspace links. */
import { cp, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { copyExternalDependencies } from "./pack-and-smoke-integration-minimal";

export async function recoveryDependencies(root: string, repository: string): Promise<void> {
  const manifests = new Map<string, { path: string; dependencies: Record<string, string> }>();
  for (const path of new Bun.Glob("packages/*/package.json").scanSync({ cwd: repository })) {
    const value = JSON.parse(await readFile(join(repository, path), "utf8"));
    manifests.set(value.name, { path: dirname(path), dependencies: value.dependencies ?? {} });
  }
  const pending = ["@relkit/app", "@relkit/runtime-hono", "@relkit/providers-local"];
  const copied = new Set<string>();
  const external = new Set(["@types/bun", "typescript"]);
  for (const name of pending) {
    if (copied.has(name)) continue;
    const manifest = manifests.get(name);
    if (manifest === undefined) throw new Error(`Missing recovery dependency ${name}`);
    const target = join(root, "node_modules", name);
    await mkdir(target, { recursive: true });
    await cp(join(repository, manifest.path, "package.json"), join(target, "package.json"));
    await cp(join(repository, manifest.path, "dist"), join(target, "dist"), { recursive: true });
    copied.add(name);
    for (const dependency of Object.keys(manifest.dependencies)) {
      if (manifests.has(dependency)) pending.push(dependency);
      else external.add(dependency);
    }
  }
  await copyExternalDependencies(
    root,
    external,
    repository,
    [...copied].map((name) => join(repository, manifests.get(name)!.path)),
  );
}
