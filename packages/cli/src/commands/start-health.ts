import { API_BASE_PATH } from "@relkit/contracts";
import { Clock, Effect } from "effect";
import { cliAdapterError, cliOriginalError } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import { CliStartNative } from "./start-native.service.js";

/**
 * Polls idempotent live/ready endpoints until their shared clock deadline.
 * @param hostname - Bind address.
 * @param port - Actual allocated port.
 * @param timeoutMs - Positive readiness deadline.
 * @param child - Child exit authority, checked before every request.
 * @returns Lazy readiness; interruption cancels the in-flight fetch and stops polling.
 */
export const waitForStartHealthEffect = Effect.fn("Start.health")(
  function* (
    hostname: string,
    port: number,
    timeoutMs: number,
    child: Pick<Bun.ReadableSubprocess, "exitCode">,
  ) {
    const native = yield* CliStartNative;
    const deadline = (yield* Clock.currentTimeMillis) + timeoutMs;
    let lastError: unknown;
    while ((yield* Clock.currentTimeMillis) < deadline) {
      if (child.exitCode !== null)
        return yield* Effect.fail(
          cliAdapterError(
            "start.health",
            new Error(`Built server exited with code ${child.exitCode}.`),
          ),
        );
      const remaining = deadline - (yield* Clock.currentTimeMillis);
      const ready = yield* Effect.gen(function* () {
        const live = yield* native.health(`http://${hostname}:${port}${API_BASE_PATH}/health/live`);
        const ready = yield* native.health(
          `http://${hostname}:${port}${API_BASE_PATH}/health/ready`,
        );
        return live && ready;
      }).pipe(
        Effect.catchTag("CliAdapterError", (error) => {
          lastError = cliOriginalError(error);
          return Effect.succeed(false);
        }),
        Effect.timeoutOption(Math.max(1, remaining)),
      );
      if (ready._tag === "Some" && ready.value) return;
      const delay = deadline - (yield* Clock.currentTimeMillis);
      if (delay > 0) yield* Effect.sleep(Math.min(25, delay));
    }
    return yield* Effect.fail(
      cliAdapterError(
        "start.health",
        new Error(
          `Built server did not become ready${lastError instanceof Error ? `: ${lastError.message}` : "."}`,
        ),
      ),
    );
  },
  (effect) => observeCli("start.health.wait", effect),
);
