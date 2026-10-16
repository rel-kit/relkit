/** Dotenv resolution must not execute application preload code. */
import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Layer } from "effect";
import { CliDevEnvironment } from "../../src/services/dev-environment.service.js";
import { fileSystemLayer } from "../../src/services/filesystem.service.js";
import { processLayer } from "../../src/services/process.service.js";

test("loads dotenv values without executing a logging application preload", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-env-preload-"));
  try {
    await writeFile(join(root, ".env"), "VALUE=first\n");
    await writeFile(join(root, "bunfig.toml"), 'preload = ["./preload.ts"]\n');
    await writeFile(
      join(root, "preload.ts"),
      `
      import { appendFileSync } from "node:fs";
      appendFileSync(${JSON.stringify(join(root, "preloaded.txt"))}, "executed\\n");
      console.log("PRELOAD-RAN");
    `,
    );
    const option = `--preload=${join(root, "preload.ts")}`;
    const layer = Layer.effect(
      CliDevEnvironment,
      CliDevEnvironment.make({ BUN_OPTIONS: option, NODE_OPTIONS: "--trace-warnings" }),
    ).pipe(Layer.provide(Layer.merge(fileSystemLayer, processLayer)));
    await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* CliDevEnvironment;
        const first = yield* service.resolve(root);
        expect(first.VALUE).toBe("first");
        expect(first.BUN_OPTIONS).toBe(option);
        expect(first.NODE_OPTIONS).toBe("--trace-warnings");
        yield* Effect.promise(() => writeFile(join(root, ".env"), "VALUE=second\n"));
        expect((yield* service.resolve(root)).VALUE).toBe("second");
      }).pipe(Effect.provide(layer)),
    );
    expect(await readFile(join(root, "preloaded.txt"), "utf8").catch(() => "absent")).toBe(
      "absent",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
