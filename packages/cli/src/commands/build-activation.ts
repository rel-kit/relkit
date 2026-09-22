import { rm, rename } from "node:fs/promises";

/** Replaces a build directory while retaining the previous cohort until activation succeeds. */
export async function activateBuild(stage: string, buildDirectory: string): Promise<void> {
  const backup = `${buildDirectory}.previous-${process.pid}-${Date.now()}`;
  let previousMoved = false;
  try {
    try {
      await rename(buildDirectory, backup);
      previousMoved = true;
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    await rename(stage, buildDirectory);
  } catch (error) {
    if (previousMoved) {
      await rm(buildDirectory, { recursive: true, force: true }).catch(() => undefined);
      await rename(backup, buildDirectory).catch(() => undefined);
    }
    throw error;
  }
  if (previousMoved) await rm(backup, { recursive: true, force: true }).catch(() => undefined);
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
