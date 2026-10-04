import type { EnvDefinition, EnvShape } from "@relkit/config";
import type { FunctionRegistry } from "@relkit/engine";
import type {
  FunctionContextOf,
  FunctionInput,
  FunctionOutput,
  InvokeFunctionOptions,
  StandaloneFunctionTarget,
} from "./invoke-function.js";
import type { TestFakes } from "./fakes.js";
import type { TestProviderReplacements } from "./provider-replacements.js";
import type { LoggerOptions } from "@relkit/runtime-effect";

/** Runtime options retaining the concrete application's environment shape.
 * @typeParam S - Environment declarations inferred from the application.
 */
export interface TestRuntimeOptions<S extends EnvShape = EnvShape> {
  readonly registry?: FunctionRegistry;
  readonly logger?: LoggerOptions;
  readonly app?: { readonly env: EnvDefinition<S> };
  readonly environment?: string;
  readonly env?: Readonly<Record<string, unknown>>;
  readonly startTimeMs?: number;
  readonly closeTimeoutMs?: number;
  readonly context?: Readonly<Record<string, unknown>>;
  readonly providers?: TestProviderReplacements;
  /** Caller-owned roots enable explicit restart tests; omitted roots are temporary. */
  readonly stateRoot?: string;
}

/** Explicit failed-test state retention policy for runtime shutdown. */
export interface TestRuntimeCloseOptions {
  readonly failed?: boolean;
}

/** Deterministic native time facade advanced only by explicit test commands. */
export interface TestClock {
  readonly now: () => Date;
  readonly currentTimeMs: () => number;
  readonly advance: (milliseconds: number) => Promise<void>;
  readonly setTime: (timestamp: number) => Promise<void>;
}

/** Owned direct invocation runtime with native dependency fakes and complete shutdown. */
export interface TestRuntime {
  readonly stateRoot: string;
  readonly fakes: TestFakes;
  readonly providers: TestProviderReplacements;
  readonly env: Readonly<Record<string, unknown>>;
  readonly clock: TestClock;
  readonly invoke: <Target extends StandaloneFunctionTarget>(
    target: Target,
    input: FunctionInput<Target>,
    options?: Omit<InvokeFunctionOptions<FunctionContextOf<Target>>, "env" | "now" | "idSource">,
  ) => Promise<FunctionOutput<Target>>;
  readonly close: (options?: TestRuntimeCloseOptions) => Promise<void>;
}
