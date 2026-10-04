import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

it.effect("real HTTP remains available after a synchronous socket constructor failure", () =>
  Effect.tryPromise({
    try: (signal) =>
      new Promise<string>((resolve, reject) => {
        execFile(
          "bun",
          [fileURLToPath(new URL("../native/auto-fallback-fixture.ts", import.meta.url))],
          { signal, timeout: 8_000, maxBuffer: 64 * 1024 },
          (error, stdout, stderr) =>
            error === null ? resolve(stdout) : reject(new Error(`${error.message}\n${stderr}`)),
        );
      }),
    catch: (cause) => cause,
  }).pipe(Effect.map((output) => expect(output).toContain("native auto fallback:"))),
);

it.effect(
  "real Bun pending HTTP and SSE pulls release on return, throw and abort",
  () =>
    Effect.tryPromise({
      try: (signal) =>
        new Promise<string>((resolve, reject) => {
          execFile(
            "bun",
            [fileURLToPath(new URL("../native/iterator-fixture.ts", import.meta.url))],
            { signal, timeout: 8_000, maxBuffer: 64 * 1024 },
            (error, stdout, stderr) =>
              error === null ? resolve(stdout) : reject(new Error(`${error.message}\n${stderr}`)),
          );
        }),
      catch: (cause) => cause,
    }).pipe(Effect.map((output) => expect(output).toContain("native iterator cleanup: 7/7"))),
  10_000,
);
