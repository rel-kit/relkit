import { test, expect } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import {
  ContributorTerminal,
  contributorTerminalLayer,
} from "../../src/contributor-process.service.js";
import { CliProcess, processLayer } from "../../src/services/process.service.js";
import { runCliEffect } from "../../src/cli-runtime.js";

test("capture retains stdout, stderr and nonzero status", async () => {
  const result = await runCliEffect(
    Effect.flatMap(CliProcess, (service) =>
      service.run({
        command: process.execPath,
        args: [
          "-e",
          'process.stdout.write("native-out");process.stderr.write("native-err");process.exit(7);',
        ],
        cwd: process.cwd(),
        maximumOutputBytes: Number.MAX_SAFE_INTEGER,
      }),
    ),
    processLayer,
  );
  expect(result).toEqual({ exitCode: 7, stdout: "native-out", stderr: "native-err" });
});

test("inherited-terminal cancellation kills an ignoring parent and its descendant group", async () => {
  const directory = await mkdtemp(join(tmpdir(), "relkit-contributor 'quoted'-"));
  const receipt = join(directory, "pids.json");
  const controller = new AbortController();
  let running: Promise<unknown> | undefined;
  try {
    const fixture = join(import.meta.dir, "process-group.fixture.ts");
    running = runCliEffect(
      Effect.flatMap(ContributorTerminal, (service) =>
        service.run([process.execPath, fixture], directory),
      ),
      contributorTerminalLayer,
      controller.signal,
    );
    void running.catch(() => undefined);
    let pids: unknown;
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      try {
        pids = JSON.parse(await readFile(receipt, "utf8"));
        break;
      } catch {}
      await Bun.sleep(10);
    }
    expect(Array.isArray(pids)).toBe(true);
    controller.abort(new Error("Owned contributor cancellation."));
    await expect(running).rejects.toBeDefined();
    for (const pid of Array.isArray(pids) ? pids : []) {
      expect(typeof pid).toBe("number");
      const reapDeadline = Date.now() + 2_000;
      while (Date.now() < reapDeadline) {
        try {
          process.kill(pid, 0);
          await Bun.sleep(10);
        } catch {
          break;
        }
      }
      expect(() => process.kill(pid, 0)).toThrow();
    }
  } finally {
    controller.abort();
    await running?.catch(() => undefined);
    await rm(directory, { recursive: true, force: true });
  }
}, 20_000);

test("source executable forwards the existing version and pure index stays passive", async () => {
  const executable = join(import.meta.dir, "../../src/bin.ts");
  const child = Bun.spawn([process.execPath, executable, "--version"], {
    stdout: "pipe",
    stderr: "pipe",
    cwd: process.cwd(),
  });
  const result = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(result).toEqual(["relkit 0.6.0\n", "", 0]);
  const imported = Bun.spawn(
    [process.execPath, join(import.meta.dir, "passive-import.fixture.ts")],
    { stdout: "pipe", stderr: "pipe" },
  );
  expect(
    await Promise.all([
      new Response(imported.stdout).text(),
      new Response(imported.stderr).text(),
      imported.exited,
    ]),
  ).toEqual(["passive\n", "", 0]);
}, 20_000);
