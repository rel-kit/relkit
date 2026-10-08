import { expect, it } from "@effect/vitest";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { Effect } from "effect";

it.live("uses Bun regardless of a BUN executable override", () =>
  Effect.promise(async () => {
    const previous = process.env.BUN;
    process.env.BUN = "echo";
    try {
      const result = await runBun(["--version"], process.cwd());
      expect(result.code).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toMatch(/^\d+\.\d+\.\d+\n$/);
    } finally {
      if (previous === undefined) delete process.env.BUN;
      else process.env.BUN = previous;
    }
  }),
);

it.live("keeps source barrel imports passive and executable JSON stdout singular", () =>
  Effect.promise(async () => {
    const root = process.cwd();
    const imported = await runBun(
      [resolve(root, "packages/create-relkit/tests/passive-import.fixture.ts")],
      root,
    );
    expect(imported).toEqual({ stdout: "loaded", stderr: "", code: 0 });
    const { stdout, stderr, code } = await runBun(
      [resolve(root, "packages/create-relkit/src/bin.ts"), "--json"],
      root,
    );
    expect(code).toBe(2);
    expect(stderr).toBe("");
    expect(stdout.trim().split("\n")).toHaveLength(1);
    expect(JSON.parse(stdout)).toMatchObject({
      ok: false,
      error: { code: "RELKIT_CREATE_USAGE" },
    });
  }),
);

/**
 * Captures an explicit Bun child from either a Node or Bun test host.
 * @param args - Existing passive-import or executable fixture arguments.
 * @param cwd - Repository root supplying the fixture's dependencies.
 * @returns Both drained pipes and the status after physical process closure.
 */
function runBun(
  args: readonly string[],
  cwd: string,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn("bun", args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 5_000,
      killSignal: "SIGKILL",
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => (stderr += chunk));
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === null) reject(new Error(`Bun fixture terminated by ${signal}.`));
      else resolve({ stdout, stderr, code });
    });
  });
}
