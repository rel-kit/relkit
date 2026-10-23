/** Removes only the exact compiler outputs of extracted source modules before publishing their former owners; current source modules and all application data are protected. */

import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { movedModules as agents } from "./moved-artifacts/agents.js";
import { movedModules as testing } from "./moved-artifacts/testing.js";
import { movedModules as creator } from "./moved-artifacts/creator.js";
import { movedModules as catalog } from "./moved-artifacts/catalog.js";

const owners = {
  agents: { root: "packages/agents", modules: agents },
  testing: { root: "packages/testing", modules: testing },
  creator: { root: "packages/create-relkit", modules: creator },
  catalog: { root: "integrations/catalog", modules: catalog },
} as const;

/** Prunes an exact former-owner output list with sequential filesystem operations.
 * @param owner - Approved package owner selected by its build producer.
 * @param repositoryRoot - Producer repository root, replaceable by an isolated filesystem fixture.
 * @returns Completion after obsolete JS, declarations and their maps are removed.
 */
export async function pruneMovedAuthoringArtifacts(
  owner: keyof typeof owners,
  repositoryRoot = resolve(import.meta.dirname, ".."),
): Promise<void> {
  const selected = owners[owner];
  const root = resolve(repositoryRoot, selected.root);
  for (const stem of selected.modules) {
    if (existsSync(resolve(root, "src", stem + ".ts"))) continue;
    for (const extension of [".js", ".js.map", ".d.ts", ".d.ts.map"])
      await rm(resolve(root, "dist", stem + extension), { force: true });
  }
}

if (import.meta.main) {
  const owner = process.argv[2];
  if (owner !== "agents" && owner !== "testing" && owner !== "creator" && owner !== "catalog")
    throw new Error("Expected an exact moved-artifact owner: agents, testing, creator, catalog.");
  await pruneMovedAuthoringArtifacts(owner);
}
