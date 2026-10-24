/** Proves the generated repaired auth image with physically enforced local resource limits. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanupDocker } from "./production-docker-owner.js";
import type { DockerOwner } from "./production-docker-owner.types.js";
import { exerciseDockerImage } from "./production-docker-runtime.js";

/**
 * Uses one builder and one runtime container, and always removes their exact owned identities.
 * @param root - Owned acceptance fixture or relocated application root.
 * @param registryPort - Actual listener port reachable by the fixture container through host.docker.internal.
 * @returns After bounded image/runtime acceptance and exact owned-object cleanup, rejecting any retained failure.
 */
export async function verifyDockerProduction(root: string, registryPort: number): Promise<void> {
  const id = `relkit-production-${crypto.randomUUID()}`;
  const names: DockerOwner = {
    builder: id,
    image: `${id}:auth`,
    container: `${id}-auth`,
    builderCreated: false,
  };
  const context = join(root, ".relkit/build");
  const original = await readFile(join(context, "Dockerfile"), "utf8");
  let failure: Error | undefined;
  console.log(JSON.stringify({ dockerOwner: names }));
  try {
    await exerciseDockerImage(root, registryPort, original, names);
  } catch (cause) {
    failure = new Error("Production Docker acceptance failed", { cause });
  } finally {
    const errors = await cleanupDocker(names, failure !== undefined);
    try {
      await writeFile(join(context, "Dockerfile"), original);
    } catch (cause) {
      errors.push(new Error("Fixture Dockerfile restoration failed", { cause }));
    }
    if (failure !== undefined || errors.length > 0)
      throw new AggregateError(
        [...(failure === undefined ? [] : [failure]), ...errors],
        "Production Docker proof or cleanup failed",
      );
  }
}
