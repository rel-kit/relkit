import { expect, test } from "vitest";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

test("packed observability installs and starts its managed Node/native worker", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-native-package-"));
  try {
    const tarballs: Record<string, string> = {};
    for (const name of ["contracts", "observability"]) {
      const artifacts = join(root, name);
      await mkdir(artifacts);
      await run(
        ["bun", "pm", "pack", "--ignore-scripts", "--destination", artifacts, "--quiet"],
        resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", name),
      );
      tarballs[`@relkit/${name}`] = `file:${join(artifacts, (await readdir(artifacts))[0]!)}`;
    }
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({
        private: true,
        type: "module",
        dependencies: tarballs,
        overrides: tarballs,
      }),
    );
    await run(["bun", "install", "--ignore-scripts"], root);
    const script = `
      import { startLocalWorker } from "@relkit/observability/local";
      const worker = startLocalWorker();
      try {
        await worker.call({ type: "open", root: "./history" });
        const records = await worker.call({ type: "append", records: [{ key: "packed", origin: "application", record: { version: 2, signal: "log", level: "info", timestamp: new Date().toISOString(), component: "smoke", message: "Native package works", fields: {} } }] });
        if (records[0]?.cursor !== "1") throw new Error("Missing committed cursor");
      } finally { await worker.close(); }
    `;
    await writeFile(join(root, "smoke.mjs"), script);
    await run(["node", "smoke.mjs"], root);
    expect((await readdir(join(root, "history"))).includes("observability.duckdb")).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 60_000);

async function run(command: string[], cwd: string): Promise<void> {
  const child = spawn(command[0]!, command.slice(1), { cwd });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  const code = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  if (code !== 0) throw new Error(`${command.join(" ")} failed: ${stdout}${stderr}`);
}
