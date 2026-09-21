import { readFile, writeFile } from "node:fs/promises";

export type FileSnapshot = {
  readonly path: string;
  readonly contents: Uint8Array;
};

export async function snapshotFile(path: string): Promise<FileSnapshot> {
  return { path, contents: await readFile(path) };
}

export async function restoreFile(snapshot: FileSnapshot): Promise<void> {
  await writeFile(snapshot.path, snapshot.contents);
}
