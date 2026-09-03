import { expect, test } from "bun:test";
import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("packed observability installs and starts its managed Node/native worker", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-native-package-"));
  try {
    const tarballs: Record<string, string> = {};
    for (const name of ["contracts", "observability"]) {
      const artifacts = join(root, name);
      await mkdir(artifacts);
      await run(
        [process.execPath, "pm", "pack", "--ignore-scripts", "--destination", artifacts, "--quiet"],
        resolve(import.meta.dir, "..", name),
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
    await run([process.execPath, "install", "--ignore-scripts"], root);
    const script = `
      import { startLocalWorker } from "@relkit/observability/local";
      const worker = startLocalWorker();
      try {
        await worker.call({ type: "open", root: "./history" });
        const records = await worker.call({ type: "append", records: [{ key: "packed", origin: "application", record: { version: 1, signal: "log", level: "info", timestamp: new Date().toISOString(), component: "smoke", message: "Native package works", fields: {} } }] });
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
  const child = Bun.spawn(command, { cwd, stdout: "pipe", stderr: "pipe" });
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (code !== 0) throw new Error(`${command.join(" ")} failed: ${stdout}${stderr}`);
}
