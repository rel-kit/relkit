/**
 * Proof that a project installed the packed candidate and not the published package of the same
 * version: the local registry serves candidate archives only from `/_tar/<name>`, and every other
 * package from npmjs, so a lockfile entry resolved from that address came from the candidate.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { PreparedRegistryIndex } from "./node-creation-registry.js";
import type { Project } from "./node-creation-steps.js";

/** The prepared candidate: its index and the directory holding the archives. */
export interface Candidate {
  readonly directory: string;
  readonly index: PreparedRegistryIndex;
  /** Address of the local registry serving the candidate. */
  readonly registryUrl: string;
}

/**
 * Requires every named candidate package to be installed from its packed archive.
 * @param candidate - The prepared candidate.
 * @param project - Project whose lockfile is read.
 * @param names - Packages that must be present in the lockfile.
 * @returns Completion; throws naming a package that is missing or came from elsewhere.
 */
export async function assertCandidateInstalled(
  candidate: Candidate,
  project: Project,
  names: readonly string[],
): Promise<void> {
  const lockfile = await readFile(
    join(project.directory, project.manager === "npm" ? "package-lock.json" : "pnpm-lock.yaml"),
    "utf8",
  );
  for (const name of names) {
    const entry = candidate.index.packages.find((item) => item.manifest.name === name);
    if (entry === undefined) throw new Error(`${name} is not in the prepared candidate.`);
    const address = `${candidate.registryUrl}/_tar/${encodeURIComponent(name)}`;
    if (!lockfile.includes(address))
      throw new Error(
        `${name}@${entry.manifest.version} in the lockfile was not resolved from the packed candidate (${address}); a published copy was installed.`,
      );
    console.log(`candidate installed: ${name}@${entry.manifest.version} from ${address}`);
  }
}
