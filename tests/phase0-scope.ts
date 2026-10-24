/** Checks original source-scope exclusions and distinguishes generated coverage from authored coverage using native scoped fixtures. */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { scanScope } from "../scripts/scope-scan.js";
import { execute, boundaryScript, withFixture } from "./phase0-harness.js";
import { manifest } from "./phase0-contracts.js";
import { scopeFixture } from "./phase0-scope-fixture.js";

describe.serial("Phase 0 guardrails", () => {
  test("scans content only when the final file extension is text", async () => {
    const name = ["terra", "form"].join("");
    const image = "tests/example.spec.ts-snapshots/image.png";
    const source = "packages/app/src/value.ts";
    return withFixture(
      { [image]: name, [source]: `export const value = "${name}";` },
      async (fixture) => {
        expect(scanScope(fixture)).toEqual([
          expect.objectContaining({ file: source, rule: "alternate-iac" }),
        ]);
        const result = await execute(process.execPath, ["run", boundaryScript, fixture]);
        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain(source);
        expect(result.stderr).not.toContain(image);
      },
    );
  });
  test("scope exclusions report each affected path and rule", async () => {
    const { files, expected } = scopeFixture();
    return withFixture(files, async (fixture) => {
      const findings = scanScope(fixture);
      for (const [file, rule] of expected) {
        expect(findings).toContainEqual(expect.objectContaining({ file, rule }));
      }
      expect(findings).not.toContainEqual(
        expect.objectContaining({ file: "packages/app/src/error-code.ts" }),
      );
    });
  });
  test("ignores workspace coverage reports but still checks authored coverage files", async () => {
    const report = JSON.stringify({ name: ["pers", "istence"].join("") });
    const generated = "packages/compiler/coverage/coverage-final.json";
    const authored = "packages/compiler/src/coverage/coverage-final.json";
    return withFixture(
      {
        "packages/compiler/package.json": manifest("@relkit/compiler"),
        [generated]: report,
      },
      async (fixture) => {
        expect(scanScope(fixture)).toEqual([]);
        expect((await execute(process.execPath, ["run", boundaryScript, fixture])).exitCode).toBe(
          0,
        );
        await mkdir(dirname(join(fixture, authored)), { recursive: true });
        await writeFile(join(fixture, authored), report);
        expect(scanScope(fixture)).toEqual([
          expect.objectContaining({ file: authored, rule: "out-of-scope-navigation-name" }),
        ]);
        const result = await execute(process.execPath, ["run", boundaryScript, fixture]);
        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain(authored);
        expect(result.stderr).not.toContain(generated);
        expect(readFileSync(join(fixture, generated), "utf8")).toBe(report);
      },
    );
  });
});
