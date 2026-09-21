import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname } from "node:path";
import type { ArtifactWriteResult } from "./generated-artifacts.js";

/** Writes changed bytes only; the unchanged path is never opened for writing. */
export async function writeIfChanged(
  filePath: string,
  content: string,
): Promise<ArtifactWriteResult> {
  const next = Buffer.from(content, "utf8");
  let unchanged = false;
  try {
    unchanged = (await readFile(filePath)).equals(next);
  } catch (error) {
    if (!isMissingFile(error)) throw error;
  }
  if (!unchanged) {
    await mkdir(dirname(filePath), { recursive: true });
    const temporary = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    try {
      await writeFile(temporary, next, { flag: "wx" });
      await rename(temporary, filePath);
    } finally {
      await rm(temporary, { force: true });
    }
  }
  return Object.freeze({
    fileName: basename(filePath),
    path: filePath,
    changed: !unchanged,
    bytes: next.byteLength,
  });
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
