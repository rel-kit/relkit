/** Checks the migration-specific terminal cancellation contract without acquiring project authority. */
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { runCli } from "../../src/main.js";
import { failSignal } from "../../src/main-support.js";

it.live("reports one secret-safe migration object and status 130 for either native signal", () =>
  Effect.gen(function* () {
    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      const controller = new AbortController();
      controller.abort(failSignal(signal));
      const output: string[] = [];
      const code = yield* Effect.tryPromise(() =>
        runCli(["--json", "migrate", "layout", "--write"], {
          signal: controller.signal,
          installSignalHandlers: false,
          io: {
            stdout: (line) => {
              output.push(line);
            },
            stderr: () => undefined,
          },
        }),
      );
      expect(code).toBe(130);
      expect(output).toHaveLength(1);
      expect(JSON.parse(output[0] ?? "null")).toMatchObject({
        ok: false,
        error: { code: "RELKIT_INTERRUPTED" },
      });
    }
  }),
);
