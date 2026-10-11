/**
 * Exercises the isolated integrity worker protocol directly so its filesystem
 * authority stays limited to the working directory selected by the parent.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("uses the inherited working directory as its only root authority", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-snapshot-integrity-"));
  try {
    await writeFile(join(root, "input.ts"), "inside");
    const worker = fileURLToPath(
      new URL("../../src/dev-snapshot/snapshot-hash-worker.ts", import.meta.url),
    );
    const child = spawn("bun", [worker, "100"], {
      cwd: root,
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => (stdout += chunk));
    child.stderr.on("data", (chunk: string) => (stderr += chunk));
    child.stdin.end(JSON.stringify(["input.ts"]));
    const [code] = await once(child, "close");

    expect(stderr).toBe("");
    expect(code).toBe(0);
    expect(JSON.parse(stdout)).toEqual([
      {
        path: "input.ts",
        bytes: 6,
        hash: `sha256:${createHash("sha256").update("inside").digest("hex")}`,
      },
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
