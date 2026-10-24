/** Verifies exact stale-output pruning in a temporary repository while preserving current source counterparts and unlisted owned artifacts. */

import { expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pruneMovedAuthoringArtifacts } from "../prune-moved-authoring-artifacts.js";

test("prunes listed former modules and maps while retaining current and unlisted outputs", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-moved-artifacts-"));
  const owner = join(root, "packages/agents");
  try {
    await mkdir(join(owner, "src"), { recursive: true });
    await mkdir(join(owner, "dist"));
    await writeFile(join(owner, "src/runtime.ts"), "export {};\n");
    for (const extension of [".js", ".js.map", ".d.ts", ".d.ts.map"])
      await writeFile(join(owner, "dist/graph-runtime" + extension), "old native output");
    await writeFile(join(owner, "dist/runtime.js"), "current source output");
    await writeFile(join(owner, "dist/unlisted.js"), "owned unlisted output");
    await pruneMovedAuthoringArtifacts("agents", root);
    for (const extension of [".js", ".js.map", ".d.ts", ".d.ts.map"])
      await expect(readFile(join(owner, "dist/graph-runtime" + extension))).rejects.toMatchObject({
        code: "ENOENT",
      });
    expect(await readFile(join(owner, "dist/runtime.js"), "utf8")).toBe("current source output");
    expect(await readFile(join(owner, "dist/unlisted.js"), "utf8")).toBe("owned unlisted output");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
