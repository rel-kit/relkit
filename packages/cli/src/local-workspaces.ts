import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export async function workspacePackageRoots(root: string): Promise<ReadonlyMap<string, string>> {
  const packages = new Map<string, string>();
  for (const pattern of [
    "packages/*/package.json",
    "integrations/packages/*/package.json",
    "integrations/catalog/package.json",
  ]) {
    for await (const path of new Bun.Glob(pattern).scan({ cwd: root })) {
      const file = join(root, path);
      const manifest = JSON.parse(await readFile(file, "utf8")) as { name: string };
      packages.set(manifest.name, dirname(file));
    }
  }
  return packages;
}
