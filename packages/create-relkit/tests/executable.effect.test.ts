import { expect, it } from "@effect/vitest";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Effect } from "effect";

it.live("keeps source barrel imports passive and executable JSON stdout singular", () =>
  Effect.promise(async () => {
    const root = process.cwd();
    const index = pathToFileURL(resolve(root, "packages/create-relkit/src/index.ts")).href;
    const imported = await runBun(
      ["-e", "await import(" + JSON.stringify(index) + '); process.stdout.write("loaded");'],
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
    const child = spawn(process.env.BUN ?? "bun", args, {
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
