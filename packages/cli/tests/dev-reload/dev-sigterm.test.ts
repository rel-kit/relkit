/**
 * `SIGTERM` sent to the `relkit dev` CLI alone, as a process manager, an IDE stop button or a
 * test harness does, ends the whole session: the CLI exits within a few seconds and no
 * descendant is left, including the native compiler the application's `typescript` 7 launcher
 * starts for the type-check watch. Ctrl+C reaches the foreground process group and hides the
 * defect, so the test signals only the CLI's pid. It runs on Bun and on Node, with the
 * application's own `typescript` and with a `tsgo` launcher that keeps a long-lived child:
 * Node 22.15 and later runs `typescript` 7's native compiler in place (`process.execve`), so
 * only Bun, older Node and other launchers meet the launcher-with-a-child shape.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chmodSync } from "node:fs";
import { join } from "node:path";
import { createDevFixture, startDev } from "./dev-reload.fixture.js";
import type { DevProcess } from "./dev-reload.fixture.types.js";

/** Longest the CLI may take to exit after `SIGTERM`. */
const EXIT_BUDGET_MS = 5_000;

/**
 * Lists a process's descendants.
 * @param root - Process ID whose subtree is listed.
 * @returns Descendants as pid and command line.
 */
async function descendants(root: number): Promise<{ pid: number; command: string }[]> {
  const table = await new Response(
    Bun.spawn(["ps", "-axo", "pid=,ppid=,command="], { stdout: "pipe" }).stdout,
  ).text();
  const rows = table.split("\n").flatMap((line) => {
    const match = /^\s*(\d+)\s+(\d+)\s+(.*)$/u.exec(line);
    return match === null
      ? []
      : [{ pid: Number(match[1]), ppid: Number(match[2]), command: match[3]! }];
  });
  const found = new Set([root]);
  const result: { pid: number; command: string }[] = [];
  for (let grew = true; grew;) {
    grew = false;
    for (const row of rows)
      if (found.has(row.ppid) && !found.has(row.pid)) {
        found.add(row.pid);
        result.push({ pid: row.pid, command: row.command });
        grew = true;
      }
  }
  return result;
}

/**
 * Checks whether a process exists.
 * @param pid - Process ID.
 * @returns Whether a signal 0 reaches it.
 */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** A `tsgo` launcher that starts a long-lived child holding its output and outlives a signal to itself. */
const FAKE_TSGO = `#!/usr/bin/env node
const { spawn } = require("node:child_process");
const body = "/* relkit-fake-native */ setInterval(() => process.stdout.write('.'), 100)";
const child = spawn(process.execPath, ["-e", body], { stdio: ["ignore", "inherit", "ignore"] });
child.on("exit", (code) => process.exit(code ?? 1));
`;

for (const host of ["bun", "node"] as const)
  for (const compiler of ["typescript", "launcher"] as const)
    describe(`${host} with ${compiler === "typescript" ? "the application's typescript" : "a launcher script"}`, () => {
      const fixture = createDevFixture();
      const marker = compiler === "typescript" ? "typescript" : "relkit-fake-native";
      let dev: DevProcess;
      let tree: { pid: number; command: string }[] = [];

      beforeAll(async () => {
        if (compiler === "launcher") {
          fixture.write("node_modules/.bin/tsgo", FAKE_TSGO);
          chmodSync(join(fixture.root, "node_modules/.bin/tsgo"), 0o755);
        }
        dev = await startDev(fixture.root, true, [], host);
        await dev.waitFor("/b1", "b1 v0");
        const deadline = Date.now() + 60_000;
        while (Date.now() < deadline) {
          tree = await descendants(dev.pid);
          if (tree.some((entry) => entry.command.includes(marker))) break;
          await Bun.sleep(100);
        }
      }, 180_000);

      afterAll(async () => {
        for (const { pid } of tree) if (alive(pid)) process.kill(pid, "SIGKILL");
        await dev.stop();
        fixture.remove();
      }, 60_000);

      test("SIGTERM to the CLI alone exits it and leaves no descendant", async () => {
        expect(tree.some((entry) => entry.command.includes(marker))).toBe(true);
        const signalled = Date.now();
        process.kill(dev.pid, "SIGTERM");
        const exited = await Promise.race([
          dev.exited,
          Bun.sleep(EXIT_BUDGET_MS).then(() => "hung"),
        ]);
        expect({ exited, within: Date.now() - signalled <= EXIT_BUDGET_MS }).toEqual({
          exited: 143,
          within: true,
        });
        const deadline = Date.now() + 1_000;
        while (tree.some(({ pid }) => alive(pid)) && Date.now() < deadline) await Bun.sleep(50);
        expect(tree.filter(({ pid }) => alive(pid))).toEqual([]);
      }, 60_000);
    });
