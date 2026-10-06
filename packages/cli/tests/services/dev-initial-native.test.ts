import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Schema } from "effect";
import { existsSync } from "node:fs";

const positivePid = Schema.Number.check(Schema.isInt(), Schema.isGreaterThan(0));
const receiptSchema = Schema.Tuple([positivePid, positivePid]);

/**
 * Detects only the exclusively spawned fixture process.
 * @param pid - Native fixture PID admitted from its private marker.
 * @returns Whether the process remains in the operating system table.
 */
function running(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ESRCH") return false;
    throw error;
  }
}

/**
 * Releases every fixture-owned PID even if one cleanup fails.
 * @param pids - Compiler and descendant admitted by the private receipt.
 * @returns Completion after signal delivery; only the benign exit race is ignored.
 */
function killOwned(pids: readonly number[]): void {
  const failures: unknown[] = [];
  for (const pid of pids) {
    try {
      if (running(pid)) process.kill(pid, "SIGKILL");
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ESRCH"))
        failures.push(error);
    }
  }
  if (failures.length) throw new AggregateError(failures, "Fixture process cleanup failed.");
}

/**
 * Joins the compiler's atomic readiness marker rather than delaying cancellation arbitrarily.
 * @param root - Exclusively owned fixture directory.
 * @param child - Actual CLI process whose early exit fails readiness.
 * @param output - Joined native readers supplying an early-exit diagnostic.
 * @returns The compiler and descendant PIDs once CPU work has started.
 */
async function awaitPids(
  root: string,
  child: Bun.Subprocess<"ignore", "pipe", "pipe">,
  output: Promise<readonly string[]>,
): Promise<readonly [number, number]> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null)
      throw new Error(`Initial CLI exited (${child.exitCode}): ${(await output).join("\n")}`);
    const text = await readFile(join(root, "pids.json"), "utf8").catch(() => undefined);
    if (text !== undefined) return Schema.decodeUnknownSync(receiptSchema)(JSON.parse(text));
    await Bun.sleep(10);
  }
  throw new Error("Initial compiler never reached its CPU-bound fixture.");
}

test.skipIf(process.platform === "win32")(
  "initial development SIGTERM joins the CPU-bound compiler group within the strict shutdown limit",
  async () => {
    // The executable's contributor launcher delegates external directories to
    // workspace synchronization. This owned workspace fixture selects the real
    // CLI command directly without that unrelated build step.
    const root = await mkdtemp(fileURLToPath(new URL("./.initial-compiler-", import.meta.url)));
    let child: Bun.Subprocess<"ignore", "pipe", "pipe"> | undefined;
    let pids: readonly [number, number] | undefined;
    let output: Promise<readonly string[]> | undefined;
    try {
      await writeFile(
        join(root, "relkit.config.ts"),
        `
if (typeof process.send === "function") {
const descendant = Bun.spawn([process.execPath, "-e", "setInterval(() => {}, 1000)"], {
  stdin: "ignore", stdout: "ignore", stderr: "ignore",
});
const marker = new URL("./pids.json", import.meta.url);
await Bun.write(new URL("./pids.json.tmp", import.meta.url), JSON.stringify([process.pid, descendant.pid]));
const { rename } = await import("node:fs/promises");
await rename(new URL("./pids.json.tmp", import.meta.url), marker);
while (true) {}
}
export default {};
`,
      );
      // The CLI has no IPC channel, so its earlier port-config import completes.
      // Only the live isolated initial worker owns IPC and admits CPU work.
      const bin = fileURLToPath(new URL("../../src/bin.ts", import.meta.url));
      child = Bun.spawn(
        [
          process.execPath,
          bin,
          "dev",
          "--project-root",
          root,
          "--port",
          "12345",
          "--inspector-port",
          "12346",
        ],
        {
          cwd: root,
          stdin: "ignore",
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      output = Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
      pids = await awaitPids(root, child, output);
      expect(pids.every((pid) => pid > 0 && running(pid))).toBe(true);
      const started = Date.now();
      child.kill("SIGTERM");
      const exitCode = await Promise.race([child.exited, Bun.sleep(2_000).then(() => undefined)]);
      // Assert the finite deadline before awaiting readers so a hung child
      // reaches finally and its physical cleanup can finish.
      expect(exitCode).toBeDefined();
      expect(exitCode, (await output).join("\n")).toBe(143);
      expect(Date.now() - started).toBeLessThan(2_000);
      expect(existsSync(join(root, ".relkit"))).toBe(false);
      for (const pid of pids) {
        for (let attempt = 0; attempt < 100 && running(pid); attempt++) await Bun.sleep(10);
        expect(running(pid)).toBe(false);
      }
      expect(Date.now() - started).toBeLessThan(2_000);
    } finally {
      try {
        try {
          if (child?.exitCode === null) {
            child.kill("SIGTERM");
            await Promise.race([child.exited, Bun.sleep(2_000)]);
            if (child.exitCode === null) child.kill("SIGKILL");
          }
          await child?.exited;
        } finally {
          try {
            if (pids === undefined) {
              const text = await readFile(join(root, "pids.json"), "utf8").catch(() => undefined);
              if (text !== undefined)
                pids = Schema.decodeUnknownSync(receiptSchema)(JSON.parse(text));
            }
            killOwned(pids ?? []);
          } finally {
            await output;
          }
        }
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  },
  15_000,
);
