import { Effect, Option } from "effect";
import { captureOutputLines } from "@relkit/supervisor";
import { cliPromise, cliTry } from "../cli-errors.js";
import { ownedNativePromise } from "../services/owned-promise.js";
import { observeCli } from "../cli-runtime.js";
import type { DevLog } from "./dev.types.js";

/**
 * Terminates the acquired inspector and waits for a bounded physical receipt.
 * @param child - Owned native child.
 * @param timeout - TERM grace period.
 * @returns Joined native exit after optional KILL; deadline expiry remains explicit.
 */
export const stopInspectorChildEffect = Effect.fn("Dev.stopInspector")(
  function* (child: Bun.ReadableSubprocess, timeout: number) {
    yield* cliTry("dev.inspector.term", () => {
      if (child.exitCode === null) child.kill("SIGTERM");
    });
    const exited = yield* cliPromise("dev.inspector.exit", () => child.exited).pipe(
      Effect.interruptible,
      Effect.timeoutOption(timeout),
    );
    if (Option.isNone(exited)) {
      yield* cliTry("dev.inspector.kill", () => {
        if (child.exitCode === null) child.kill("SIGKILL");
      });
      const reaped = yield* cliPromise("dev.inspector.exit", () => child.exited).pipe(
        Effect.interruptible,
        Effect.timeoutOption(5_000),
      );
      if (Option.isNone(reaped))
        return yield* cliTry("dev.inspector.reap", () => {
          throw new Error("Inspector did not exit within the cleanup deadline.");
        });
    }
  },
  (effect, _child: Bun.ReadableSubprocess, _timeout: number) =>
    observeCli("dev.inspector.child.stop", effect),
);

/**
 * Adapts one native SDK output reader while joining interruption before its scope closes.
 * @param stream - Child-owned output stream.
 * @param channel - Terminal origin.
 * @param limit - Per-stream byte bound.
 * @param log - Existing safe synchronous sink.
 * @returns Completion with a bounded warning on native read failure.
 */
export const captureInspectorOutputEffect = Effect.fn("Dev.captureInspectorOutput")((
  stream: ReadableStream<Uint8Array>,
  channel: "stdout" | "stderr",
  limit: number,
  log: DevLog,
) => {
  return observeCli(
    "dev.inspector.output.capture",
    ownedNativePromise("dev.inspector.output", (signal) =>
      captureOutputLines(
        stream,
        (output) =>
          log({
            level: channel === "stderr" ? "warn" : "info",
            event: "inspector.output",
            fields: { channel, output },
          }),
        { maxBytes: limit, signal },
      ),
    ).pipe(
      Effect.catchTag("CliAdapterError", (error) =>
        Effect.sync(() =>
          log({
            level: "warn",
            event: "inspector.output.failed",
            fields: { message: error.message },
          }),
        ),
      ),
    ),
  );
});
