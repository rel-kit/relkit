import { assert, it } from "@effect/vitest";
import { Effect } from "effect";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { nativeAttempt } from "../../src/native-edge.js";

it.live(
  "survives real Bun proxy idle timeouts and releases pending response pulls on explicit lifecycle endings",
  () =>
    Effect.gen(function* () {
      const fixture = fileURLToPath(new URL("../fixtures/native-stream.ts", import.meta.url));
      const output = yield* nativeAttempt(
        () =>
          new Promise<string>((resolve, reject) => {
            // Native listener acceptance runs in Bun; the external deadline bounds failures.
            execFile("bun", [fixture], { timeout: 12_000 }, (error, stdout, stderr) => {
              if (error !== null) reject(new Error(`${error.message}\n${stderr}`));
              else resolve(stdout);
            });
          }),
      );
      assert.include(output, "native SSE lifecycle verified");
    }),
  15_000,
);
