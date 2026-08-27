import { resolveEnv, type EnvDefinition, type EnvShape } from "@relkit/config";
import type { InvocationRunner } from "@relkit/runtime-effect";
import {
  invokeFunctionWithRunner,
  type FunctionContextOf,
  type FunctionInput,
  type FunctionOutput,
  type InvokeFunctionOptions,
  type StandaloneFunctionTarget,
} from "./invoke-function.js";
import { createTestFakes, type TestFakes } from "./fakes.js";
import { combineSignals, createDeterministicClock } from "./runtime-clock.js";
import { createTestStateRoot } from "./state-root.js";

export interface TestRuntimeOptions {
  readonly app?: { readonly env: EnvDefinition<EnvShape> };
  readonly environment?: string;
  readonly env?: Readonly<Record<string, unknown>>;
  readonly startTimeMs?: number;
  readonly closeTimeoutMs?: number;
  /** Caller-owned roots enable explicit restart tests; omitted roots are temporary. */
  readonly stateRoot?: string;
}

export interface TestRuntimeCloseOptions {
  readonly failed?: boolean;
}

export interface TestClock {
  readonly now: () => Date;
  readonly currentTimeMs: () => number;
  readonly advance: (milliseconds: number) => Promise<void>;
  readonly setTime: (timestamp: number) => Promise<void>;
}

export interface TestRuntime {
  readonly stateRoot: string;
  readonly fakes: TestFakes;
  readonly env: Readonly<Record<string, unknown>>;
  readonly clock: TestClock;
  readonly invoke: <Target extends StandaloneFunctionTarget>(
    target: Target,
    input: FunctionInput<Target>,
    options?: Omit<InvokeFunctionOptions<FunctionContextOf<Target>>, "env" | "now" | "idSource">,
  ) => Promise<FunctionOutput<Target>>;
  readonly close: (options?: TestRuntimeCloseOptions) => Promise<void>;
}

/** Creates a small deterministic runtime for direct function tests. */
export function createTestRuntime(options: TestRuntimeOptions = {}): TestRuntime {
  const closeTimeoutMs = options.closeTimeoutMs ?? 1_000;
  validateTimeout(closeTimeoutMs);
  const resolvedEnv = resolveRuntimeEnv(options);
  const deterministic = createDeterministicClock(options.startTimeMs ?? 0);
  const stateRoot = createTestStateRoot(options.stateRoot);
  const fakes = createTestFakes(stateRoot.path, {
    clock: deterministic.clock.currentTimeMs,
  });
  const runner: InvocationRunner = {
    run: (effect, runOptions) => deterministic.run(effect, runOptions),
  };
  const idSource = createIdSource();
  const runtimeSignal = new AbortController();
  const pending = new Set<Promise<unknown>>();
  let closed = false;
  let failed = false;
  let closing: Promise<void> | undefined;

  const invoke: TestRuntime["invoke"] = (target, input, callOptions) => {
    if (closed) return Promise.reject(new Error("Test runtime is closed"));
    const signal = combineSignals(runtimeSignal.signal, callOptions?.signal);
    const result = invokeFunctionWithRunner(
      target,
      input,
      {
        ...(callOptions ?? {}),
        env: resolvedEnv,
        ...(callOptions?.clients === undefined ? { clients: fakes.clients } : {}),
        now: deterministic.clock.currentTimeMs,
        idSource,
        signal: signal.signal,
      },
      runner,
    );
    const tracked = result.then(
      (value) => {
        signal.dispose();
        return value;
      },
      (error) => {
        failed = true;
        signal.dispose();
        throw error;
      },
    );
    pending.add(tracked);
    void tracked.then(
      () => pending.delete(tracked),
      () => pending.delete(tracked),
    );
    return tracked;
  };

  const close = (closeOptions: TestRuntimeCloseOptions = {}): Promise<void> => {
    if (closing !== undefined) return closing;
    closed = true;
    runtimeSignal.abort(new Error("Test runtime closed"));
    closing = closeRuntime(
      pending,
      closeTimeoutMs,
      stateRoot.cleanup,
      () => failed || closeOptions.failed === true,
    );
    return closing;
  };

  return Object.freeze({
    stateRoot: stateRoot.path,
    fakes,
    env: resolvedEnv,
    clock: deterministic.clock,
    invoke,
    close,
  });
}

function resolveRuntimeEnv(options: TestRuntimeOptions): Readonly<Record<string, unknown>> {
  assertEnvRecord(options.env);
  if (options.app === undefined) return Object.freeze({ ...(options.env ?? {}) });
  const source: Record<string, string | undefined> = {};
  for (const [name, value] of Object.entries(options.env ?? {})) {
    source[name] = toEnvSource(value);
  }
  return resolveEnv(options.app.env, {
    environment: options.environment ?? "test",
    source,
  });
}

function assertEnvRecord(
  value: unknown,
): asserts value is Readonly<Record<string, unknown>> | undefined {
  if (
    value !== undefined &&
    (value === null || typeof value !== "object" || Array.isArray(value))
  ) {
    throw new TypeError("Test runtime env must be an object");
  }
}

function toEnvSource(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string") return value;
  if (value instanceof URL) return value.toString();
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  const json = JSON.stringify(value);
  if (json === undefined) throw new TypeError("Test environment values must be serializable");
  return json;
}

function validateTimeout(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError("closeTimeoutMs must be a non-negative integer");
  }
}

function createIdSource() {
  let sequence = 0;
  return Object.freeze({
    next: (kind: "trace" | "invocation" | "span") =>
      `test-${kind}-${++sequence}` as import("@relkit/contracts").ProtocolId,
  });
}

async function closeRuntime(
  pending: Set<Promise<unknown>>,
  timeoutMs: number,
  cleanup: (failed: boolean) => void,
  failed: () => boolean,
): Promise<void> {
  const completed = await waitForPending(pending, timeoutMs);
  cleanup(failed() || !completed);
}

async function waitForPending(pending: Set<Promise<unknown>>, timeoutMs: number): Promise<boolean> {
  const all = Promise.allSettled([...pending]).then(() => undefined);
  if (pending.size === 0) {
    await all;
    return true;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  const completed = await Promise.race([all.then(() => true), timeout]);
  if (timer !== undefined) clearTimeout(timer);
  return completed;
}
