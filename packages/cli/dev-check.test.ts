import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkDevProject } from "./src/commands/dev-check.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(source?: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "relkit-dev-check-"));
  roots.push(root);
  if (source !== undefined) await writeFile(join(root, "relkit.config.ts"), source);
  return root;
}

test("isolated development checks retain ordinary diagnostics", async () => {
  const projectRoot = await fixture();
  const checked = await checkDevProject({ projectRoot, generationId: "missing-config" });
  expect(checked.ok).toBe(false);
  expect(checked.projectRoot).toBe(projectRoot);
  expect(checked.diagnostics.some((item) => item.message.includes("relkit.config.ts"))).toBe(true);
});

test("an abruptly exited compiler reports its bounded stderr instead of hanging", async () => {
  const projectRoot = await fixture('console.error("compiler fixture failed"); process.exit(7);');
  await expect(checkDevProject({ projectRoot, generationId: "crashed" })).rejects.toThrow(
    "Development compiler exited (7): compiler fixture failed",
  );
});

test.skipIf(process.platform === "win32")(
  "a completed check releases imported timers and owned descendants",
  async () => {
    const projectRoot = await fixture(`
const child = Bun.spawn([process.execPath, "-e", "setInterval(() => {}, 1000)"], {
  stdin: "ignore", stdout: "ignore", stderr: "ignore",
});
await Bun.write(new URL("./pids.json", import.meta.url), JSON.stringify([process.pid, child.pid]));
setInterval(() => {}, 1000);
throw new Error("fixture config diagnostic");
`);
    const checked = await checkDevProject({ projectRoot, generationId: "completed" });
    expect(checked.ok).toBe(false);
    expect(
      checked.diagnostics.some((item) => item.message.includes("fixture config diagnostic")),
    ).toBe(true);
    const pids = JSON.parse(await readFile(join(projectRoot, "pids.json"), "utf8")) as number[];
    for (const pid of pids) {
      for (let attempt = 0; attempt < 100 && running(pid); attempt += 1) await Bun.sleep(10);
      expect(running(pid)).toBe(false);
    }
  },
);

test.skipIf(process.platform === "win32")(
  "cancellation joins a CPU-bound compiler and terminates its evaluator process group",
  async () => {
    const projectRoot = await fixture(`
const child = Bun.spawn([process.execPath, "-e", "setInterval(() => {}, 1000)"], {
  stdin: "ignore", stdout: "ignore", stderr: "ignore",
});
await Bun.write(new URL("./pids.json", import.meta.url), JSON.stringify([process.pid, child.pid]));
while (true) {}
`);
    const controller = new AbortController();
    const interrupted = new Error("generation superseded");
    const checked = checkDevProject({ projectRoot, generationId: "cancelled" }, controller.signal);
    // Install the rejection handler before sending cancellation.
    const outcome = checked.then(
      () => undefined,
      (error: unknown) => error,
    );
    let pids: number[] | undefined;
    try {
      for (let attempt = 0; attempt < 200; attempt += 1) {
        const source = await readFile(join(projectRoot, "pids.json"), "utf8").catch(
          () => undefined,
        );
        if (source !== undefined) {
          pids = JSON.parse(source) as number[];
          break;
        }
        await Bun.sleep(10);
      }
      expect(pids).toHaveLength(2);
      controller.abort(interrupted);
      expect(await outcome).toBe(interrupted);
      // The compiler is joined before returning; allow the OS to reap its killed descendant.
      for (const pid of pids!) {
        for (let attempt = 0; attempt < 100 && running(pid); attempt += 1) await Bun.sleep(10);
        expect(running(pid)).toBe(false);
      }
    } finally {
      controller.abort(interrupted);
      await outcome;
    }
  },
);

function running(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw error;
  }
}
