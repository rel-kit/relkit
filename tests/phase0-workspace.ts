/** Exercises original read-only Git exclusions, isolated lockfile refusal and frozen-install/typecheck no-diff guarantees with joined native command ownership. */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execute, root, withTemporary } from "./phase0-harness.js";

describe.serial("Phase 0 guardrails", () => {
  test("ignores only RelKit generated and local runtime roots", async () => {
    const ignored = [
      ".relkit/generated/application.graph.json",
      ".relkit/build/server/index.js",
      ".relkit/state/records.ndjson",
      ".relkit/observability/requests.ndjson",
    ];
    const checkedIn = [
      "tests/fixtures/commerce.json",
      "tests/goldens/application.graph.json",
      "templates/default/README.md",
      "openspec/changes/implement-relkit-typescript-poc-v3/PROGRESS.md",
    ];

    for (const path of ignored) {
      expect(
        (await execute("git", ["check-ignore", "--no-index", "--quiet", "--", path])).exitCode,
      ).toBe(0);
    }
    for (const path of checkedIn) {
      expect(
        (await execute("git", ["check-ignore", "--no-index", "--quiet", "--", path])).exitCode,
      ).toBe(1);
    }
  });
});

describe.serial("Phase 0 guardrails", () => {
  test("rejects lockfile drift in an isolated workspace", async () => {
    const packageJson = {
      name: "lockfile-fixture",
      private: true,
      type: "module",
      dependencies: { "local-dep": "file:./dep" },
    };
    return withTemporary("relkit-lockfile-", async (fixture) => {
      await mkdir(join(fixture, "dep"), { recursive: true });
      await writeFile(
        join(fixture, "dep/package.json"),
        JSON.stringify({ name: "local-dep", version: "1.0.0" }),
      );
      await writeFile(join(fixture, "package.json"), JSON.stringify(packageJson));
      expect((await execute(process.execPath, ["install"], fixture)).exitCode).toBe(0);
      await mkdir(join(fixture, "other-dep"), { recursive: true });
      await writeFile(
        join(fixture, "other-dep/package.json"),
        JSON.stringify({ name: "other-dep", version: "1.0.0" }),
      );
      await writeFile(
        join(fixture, "package.json"),
        JSON.stringify({
          ...packageJson,
          dependencies: { "local-dep": "file:./other-dep" },
        }),
      );
      const result = await execute(process.execPath, ["install", "--frozen-lockfile"], fixture);
      expect(result.exitCode).not.toBe(0);
      expect(`${result.stdout}\n${result.stderr}`).toMatch(/lockfile|frozen/i);
    });
  });
});

describe.serial("Phase 0 guardrails", () => {
  test(
    "frozen install and typecheck leave lockfile/generated state unchanged",
    async () => {
      const beforeLockfile = readFileSync(join(root, "bun.lock"), "utf8");
      const beforeGenerated = await execute("git", [
        "diff",
        "--binary",
        "--",
        ".relkit/generated",
        ".relkit/build",
      ]);
      const beforeGeneratedStatus = await execute("git", [
        "status",
        "--porcelain=v1",
        "--untracked-files=all",
        "--",
        ".relkit/generated",
        ".relkit/build",
      ]);
      expect((await execute(process.execPath, ["install", "--frozen-lockfile"])).exitCode).toBe(0);
      expect((await execute(process.execPath, ["run", "typecheck"], root, 20_000)).exitCode).toBe(
        0,
      );
      expect(readFileSync(join(root, "bun.lock"), "utf8")).toBe(beforeLockfile);
      const afterGenerated = await execute("git", [
        "diff",
        "--binary",
        "--",
        ".relkit/generated",
        ".relkit/build",
      ]);
      const afterGeneratedStatus = await execute("git", [
        "status",
        "--porcelain=v1",
        "--untracked-files=all",
        "--",
        ".relkit/generated",
        ".relkit/build",
      ]);
      expect(afterGenerated.stdout).toBe(beforeGenerated.stdout);
      expect(afterGeneratedStatus.stdout).toBe(beforeGeneratedStatus.stdout);
    },
    { timeout: 30_000 },
  );
});
