import { expect, it } from "@effect/vitest";
import { Effect, Fiber } from "effect";
import { contributorCallback } from "../../src/contributor-callback.js";

it.live("retains a borrowed native cancellation reason at the inner invocation", () =>
  Effect.gen(function* () {
    const caller = new AbortController();
    const original = new Error("Received SIGINT.");
    const running = yield* Effect.forkScoped(
      contributorCallback(
        "contributor.test",
        async (signal) => {
          await new Promise<void>((resolve) => {
            signal.addEventListener("abort", () => resolve(), { once: true });
            caller.abort(original);
          });
          expect(signal.reason).toBe(original);
          return 130;
        },
        caller.signal,
      ),
    );
    expect(yield* Fiber.join(running)).toBe(130);
  }),
);
