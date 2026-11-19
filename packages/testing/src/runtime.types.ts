import type { EnvDefinition, EnvShape } from "relkit/config";
import type { FunctionRegistry } from "relkit/engine";
import type {
  FunctionContextOf,
  FunctionInput,
  FunctionOutput,
  InvokeFunctionOptions,
  StandaloneFunctionTarget,
} from "./invoke-function.js";
import type { TestFakes } from "./fakes.js";
import type { TestProviderReplacements } from "./provider-replacements.js";
import type { LoggerOptions } from "relkit/runtime-effect";

/** Runtime options retaining the concrete application's environment shape.
 * @typeParam S - Environment declarations inferred from the application.
 */
export interface TestRuntimeOptions<S extends EnvShape = EnvShape> {
  /** Function registry to use; `createTestApplication` loads the project's when omitted. */
  readonly registry?: FunctionRegistry;
  /** Logger sinks and minimum level; logs are not printed when omitted. */
  readonly logger?: LoggerOptions;
  /** The application whose `env` declarations check and parse the values of `env`. */
  readonly app?: { readonly env: EnvDefinition<S> };
  /** Environment name used to resolve `env`. Defaults to `"test"`. */
  readonly environment?: string;
  /** Values for the application's environment variables; `process.env` is not read. */
  readonly env?: Readonly<Record<string, unknown>>;
  /** Starting time of the test clock, in milliseconds since the epoch. Defaults to `0`. */
  readonly startTimeMs?: number;
  /** Time `close` waits for running work, in milliseconds. Defaults to `1000`. */
  readonly closeTimeoutMs?: number;
  /** Fields that replace the handler context's defaults, such as `auth` or `database`. */
  readonly context?: Readonly<Record<string, unknown>>;
  /** Replacements for provider profiles, by capability then profile name, such as test fakes. */
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
