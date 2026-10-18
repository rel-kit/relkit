/** Proves invocation cancellation reaps both an active worker and its owned descendant. */
import { expect, test } from "bun:test";
import { watch, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { app, write } from "./fixture.js";
import { runCli } from "../../src/main.js";

test("interruption emits one safe result and joins worker/descendant cleanup", async () => {
  const root = await app();
  const receipt = join(root, "owned.json");
  await write(
    root,
    "drizzle.config.ts",
    `import { writeFileSync } from "node:fs";
const child = Bun.spawn([process.execPath,"-e","setInterval(()=>{},1000)"], {stdout:"ignore",stderr:"ignore"});
writeFileSync(${JSON.stringify(receipt)},JSON.stringify({worker:process.pid,child:child.pid}));
await new Promise(()=>{}); export default {};`,
  );
  const controller = new AbortController();
  const stdout: string[] = [];
  const ready = new Promise<void>((resolve, reject) => {
    const watcher = watch(root, () => {
      if (existsSync(receipt)) {
        clearTimeout(timer);
        watcher.close();
        resolve();
      }
    });
    const timer = setTimeout(() => {
      watcher.close();
      reject(new Error("Worker did not publish readiness"));
    }, 5000);
  });
  const running = runCli(["--json", "db", "migrate"], {
    cwd: root,
    signal: controller.signal,
    installSignalHandlers: false,
    io: { stdout: (line) => stdout.push(line), stderr: () => undefined },
  });
  try {
    await ready;
    controller.abort();
    expect(await running).toBe(130);
    expect(stdout).toHaveLength(1);
    const pids = JSON.parse(await readFile(receipt, "utf8"));
    for (const pid of [pids.worker, pids.child]) {
      for (let remaining = 50; remaining > 0; remaining--) {
        try {
          process.kill(pid, 0);
        } catch (error) {
          if (error instanceof Error && "code" in error && error.code === "ESRCH") break;
          throw error;
        }
        if (remaining === 1) throw new Error("Owned process survived cancellation");
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
  } finally {
    controller.abort();
    await running;
  }
});
