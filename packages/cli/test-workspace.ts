import { mkdir, readFile, symlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

export async function linkWorkspacePackages(projectRoot: string): Promise<void> {
  const repositoryRoot = resolve(import.meta.dir, "../..");
  const manifests = [
    ...new Bun.Glob("packages/*/package.json").scanSync({ cwd: repositoryRoot }),
    ...new Bun.Glob("integrations/catalog/package.json").scanSync({ cwd: repositoryRoot }),
    ...new Bun.Glob("integrations/packages/*/package.json").scanSync({ cwd: repositoryRoot }),
  ].sort();
  const scope = join(projectRoot, "node_modules", "@relkit");
  await mkdir(scope, { recursive: true });
  for (const manifestPath of manifests) {
    const manifest = JSON.parse(await readFile(join(repositoryRoot, manifestPath), "utf8")) as {
      readonly name?: string;
    };
    if (manifest.name?.startsWith("@relkit/"))
      await symlink(
        dirname(join(repositoryRoot, manifestPath)),
        join(projectRoot, "node_modules", manifest.name),
      );
  }
}
