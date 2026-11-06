import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const FIXTURE = fileURLToPath(new URL("./fixtures/adapter-processes.mjs", import.meta.url));

describe.each(["bun", "node"] as const)("%s processes and modules", (runtime) => {
  test("spawns with pipes and IPC, kills, locates executables and resolves modules", () => {
    const result = spawnSync(runtime, [FIXTURE], { encoding: "utf8", timeout: 30_000 });
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({
      name: runtime,
      piped: { stdout: "in-out", stderr: "err", exitCode: 0 },
      reply: { echo: { value: 1 } },
      killed: { exited: 143, signalCode: "SIGTERM" },
      missing: "ENOENT",
      which: true,
      whichMissing: null,
      resolved: true,
      // Only Bun's module registry can drop an evaluated module.
      registry: runtime === "bun",
    });
  }, 30_000);
});
