import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { restoreFile, snapshotFile } from "./preserve-build-state.ts";

test("restores a generated file after a build changes it", async () => {
  const directory = await mkdtemp(join(tmpdir(), "relkit-build-state-"));
  const path = join(directory, "generated.d.ts");
  try {
    await writeFile(path, "original\n");
    const snapshot = await snapshotFile(path);
    await writeFile(path, "generated\n");
    await restoreFile(snapshot);
    expect(await readFile(path, "utf8")).toBe("original\n");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
