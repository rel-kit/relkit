import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { OBSERVABILITY_SOURCE_ROOTS } from "../../scripts/check-observability-sinks.ts";
import { resolveOwnedSourceFile } from "../../scripts/check-logger-sinks.ts";

test("source scans reject symlinks outside their owned roots", () => {
  const root = mkdtempSync("/tmp/relkit-source-scan-");
  const outside = resolve(root, "outside.ts");
  try {
    writeFileSync(outside, "console.log('outside');\n");
    for (const sourceRoot of OBSERVABILITY_SOURCE_ROOTS)
      mkdirSync(resolve(root, sourceRoot), { recursive: true });

    const loggerRoot = resolve(root, "packages/runtime-effect/src");
    symlinkSync(outside, resolve(loggerRoot, "escape.ts"));
    expect(() => resolveOwnedSourceFile(loggerRoot, "escape.ts")).toThrow(
      "Refusing to scan file outside",
    );

    rmSync(resolve(loggerRoot, "escape.ts"));
    symlinkSync(outside, resolve(root, "packages/observability/src/escape.ts"));
    expect(() =>
      resolveOwnedSourceFile(resolve(root, OBSERVABILITY_SOURCE_ROOTS[0]), "escape.ts"),
    ).toThrow("Refusing to scan file outside");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
