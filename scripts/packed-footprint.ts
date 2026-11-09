/** Lists what a packed production install contains and rejects development tooling in it. */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

/** Packages a production install of `relkit` and one integration must not contain. */
export const developmentPackages = [
  "@relkit/cli",
  "@relkit/client",
  "@relkit/inspector",
  "@relkit/inspector-ui",
  "@relkit/testing",
  "create-relkit",
  "next",
  "typescript",
  "vitest",
] as const;

/**
 * Names every package installed under a project's `node_modules`, including Bun's isolated store.
 * @param root - Installed project root.
 * @returns Sorted installed package names.
 */
export async function installedPackages(root: string): Promise<string[]> {
  const names = new Set<string>();
  const visit = async (modules: string): Promise<void> => {
    let entries: string[];
    try {
      entries = await readdir(modules);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry === ".bin") continue;
      if (entry === ".bun") {
        for (const stored of await readdir(join(modules, entry)))
          await visit(join(modules, entry, stored, "node_modules"));
        continue;
      }
      const directories = entry.startsWith("@")
        ? (await readdir(join(modules, entry))).map((name) => join(modules, entry, name))
        : [join(modules, entry)];
      for (const directory of directories) {
        try {
          const manifest = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
          if (typeof manifest.name === "string") names.add(manifest.name);
        } catch {
          continue;
        }
      }
    }
  };
  await visit(join(root, "node_modules"));
  return [...names].sort();
}

/**
 * Fails when a production install contains development tooling.
 * @param root - Installed project root.
 * @returns The installed package names.
 */
export async function assertProductionFootprint(root: string): Promise<string[]> {
  const installed = await installedPackages(root);
  const found = developmentPackages.filter((name) => installed.includes(name));
  if (found.length > 0)
    throw new Error(`Production install contains development packages: ${found.join(", ")}`);
  return installed;
}
