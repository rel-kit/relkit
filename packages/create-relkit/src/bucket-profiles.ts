import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ADD_FAILURE_CODES, AddScaffoldError } from "./add-types.js";
import type { ProjectDiscovery } from "./project-discovery-types.js";
import { readFactoryStringProperty } from "./source-edit.js";

/** Bucket profiles identify physical buckets and cannot have two descriptor owners. */
export async function bucketProfileOwners(
  discovery: Pick<ProjectDiscovery, "projectRoot" | "artifacts" | "profiles">,
  read = (path: string) => readFile(join(discovery.projectRoot, path), "utf8"),
): Promise<ReadonlyMap<string, string>> {
  const fallback =
    discovery.profiles.find((item) => item.capability === "bucket" && item.isDefault)?.name ??
    "default";
  const owners = new Map<string, string>();
  for (const artifact of discovery.artifacts.filter(
    (item) => item.kind === "bucket" && item.exported,
  )) {
    const profile = readFactoryStringProperty(
      await read(artifact.path),
      artifact.path,
      "defineBucket",
      "profile",
    );
    if (profile === undefined && artifact.options.includes("profile"))
      throw new AddScaffoldError(
        ADD_FAILURE_CODES.unsupportedSourceShape,
        `Cannot resolve bucket profile in ${artifact.path}.`,
      );
    owners.set(profile ?? fallback, artifact.id ?? artifact.path);
  }
  return owners;
}
