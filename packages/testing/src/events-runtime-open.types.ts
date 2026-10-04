import type { materializeEvents, InvocationTarget } from "@relkit/engine";

import type { InvocationRunner } from "@relkit/runtime-effect";
import type { createEventInvoker } from "./events-runtime-utils.js";
import type { TestFailureControls } from "./fakes.js";
import type { TestStateRoot } from "./state-root.js";
import type { TestEventOptions } from "./events-types.js";

/** Native log/router acquisition inputs and deterministic generation identity. */
export interface OpenTestEventRuntimeOptions {
  readonly profile: string;
  readonly plan: Parameters<typeof materializeEvents>[0]["plan"];
  readonly owner: TestStateRoot;
  readonly options: TestEventOptions<unknown, unknown>;
  readonly now: () => number;
  readonly random: () => number;
  readonly failures: TestFailureControls;
  readonly runner: InvocationRunner;
  readonly idSource: Parameters<typeof createEventInvoker>[4];
  readonly targets: ReadonlyMap<string, InvocationTarget<unknown, unknown>>;
  readonly generation: number;
  readonly ownerSignal?: () => AbortSignal;
}
