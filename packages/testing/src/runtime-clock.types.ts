import type { Clock, Effect } from "effect";
import type { InvocationRunner } from "@relkit/runtime-effect";
import type { TestClock } from "./runtime.js";

/** Owned deterministic deadline and its native completion callback. */
export interface ClockWaiter {
  readonly at: number;
  readonly resume: (effect: Effect.Effect<void>) => void;
  done: boolean;
}

/** Manually controlled native clock with an Effect invocation runner. */
export interface DeterministicClockService {
  readonly service: Clock.Clock;
  readonly clock: TestClock;
  readonly run: InvocationRunner["run"];
}

/** Native cancellation signal and the explicit lifetime of its source listeners. */
export interface CombinedSignals {
  readonly signal: AbortSignal;
  readonly dispose: () => void;
}
