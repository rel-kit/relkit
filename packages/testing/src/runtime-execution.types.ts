import type { Effect } from "effect";
import type { TestRuntime, TestRuntimeCloseOptions } from "./runtime.js";
import type {
  StandaloneFunctionTarget,
  FunctionInput,
  FunctionOutput,
  FunctionContextOf,
  InvokeFunctionOptions,
} from "./invoke-function.js";

/** Effect invocation admission and shutdown with deterministic native runtime state. */
export interface RuntimeExecutionService {
  readonly value: Omit<TestRuntime, "invoke" | "close">;
  readonly invoke: <Target extends StandaloneFunctionTarget>(
    target: Target,
    input: FunctionInput<Target>,
    options?: Omit<InvokeFunctionOptions<FunctionContextOf<Target>>, "env" | "now" | "idSource">,
  ) => Effect.Effect<FunctionOutput<Target>, unknown>;
  readonly close: (options?: TestRuntimeCloseOptions) => Effect.Effect<void, unknown>;
}
