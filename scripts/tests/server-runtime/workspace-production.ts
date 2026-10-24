/** Executes the public CLI command against workspace-owned fixture links. */
import { mkdir, symlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { readManifests } from "../../pack-and-smoke-create-relkit-pack.js";
import { runCommand } from "../../pack-and-smoke-create-relkit-support.js";

/**
 * Builds source producers without importing private package test or runtime modules.
 * @param repository - Repository root used only to locate workspace producers and maintained fixture bytes.
 * @param root - Owned acceptance fixture or relocated application root.
 * @returns After the public CLI build completes against explicit workspace fixture links.
 */
export async function buildWorkspaceProduction(repository: string, root: string): Promise<void> {
  for (const [name, source] of await readManifests(repository)) {
    if (!name.startsWith("@relkit/")) continue;
    const destination = join(root, "node_modules", name);
    await mkdir(dirname(destination), { recursive: true });
    await symlink(source.directory, destination);
  }
  await runCommand(
    ["run", "--no-env-file", join(repository, "packages/cli/src/bin.ts"), "build"],
    root,
  );
}
