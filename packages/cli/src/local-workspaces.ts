import { readFile, realpath } from "node:fs/promises";
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

/** Shares dependencies exposed by linked workspaces so native types and runtime symbols agree. */
export async function workspaceDependencyLinks(
  root: string,
  direct: Readonly<Record<string, string>>,
  runtimeDependencies: Readonly<Record<string, string>>,
): Promise<ReadonlyMap<string, string>> {
  const workspaces = await workspacePackageRoots(root);
  const links = new Map<string, string>();
  const pending = Object.keys(direct).filter((name) => name.startsWith("@relkit/"));
  while (pending.length > 0) {
    const name = pending.pop()!;
    if (links.has(name)) continue;
    const path = workspaces.get(name);
    if (path === undefined) throw new Error(`Workspace package not found: ${name}`);
    links.set(name, path);
    const manifest = JSON.parse(await readFile(join(path, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };
    for (const dependency of Object.keys(manifest.dependencies ?? {})) {
      if (dependency.startsWith("@relkit/")) {
        pending.push(dependency);
      } else if (
        name !== "@relkit/cli" &&
        runtimeDependencies[dependency] !== undefined &&
        !links.has(dependency)
      ) {
        // The CLI's inspector dependencies must stay inside the app's web bundler root.
        const shared = await realpath(join(path, "node_modules", dependency));
        const installed = JSON.parse(await readFile(join(shared, "package.json"), "utf8")) as {
          version: string;
        };
        if (
          runtimeDependencies[dependency] === installed.version ||
          runtimeDependencies[dependency] === `link:${dependency}`
        )
          links.set(dependency, shared);
      }
    }
  }
  return links;
}
