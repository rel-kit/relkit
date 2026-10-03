import type { AgentStateProvider } from "@relkit/agents";

const tasks = new Set<Promise<unknown>>();

/** Registers native work before the fixture's durable directory is removed.
 * @param task - Accepted run or provider operation that may still access fixture state.
 * @returns Nothing; joining retains the operation's original outcome for its caller.
 */
export function trackFixtureRun(task: Promise<unknown>): void {
  tasks.add(task);
  const done = (): void => {
    tasks.delete(task);
  };
  void task.then(done, done);
}

/** Tracks provider IO independently of the interruptible Effect awaiting its Promise.
 * @param provider - Native provider whose state directory belongs to this fixture.
 * @returns The same provider contract with every native Promise registered for teardown.
 * @remarks Cancellation can settle an observer before a provider transaction finishes.
 * The fixture owns the directory, so it must join both lifetimes before removing it.
 * @example See the held control read in `agent-rpc.test.ts`.
 */
export function trackFixtureProvider(provider: AgentStateProvider): AgentStateProvider {
  return new Proxy(provider, {
    get(target, key, receiver) {
      const value: unknown = Reflect.get(target, key, receiver);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        const task: unknown = Reflect.apply(value, target, args);
        if (task instanceof Promise) trackFixtureRun(task);
        return task;
      };
    },
  });
}

/** Includes provider IO and follow-up segments registered while earlier work settles.
 * @returns Completion after all registered native work settles, including rejections.
 */
export async function joinFixtureRuns(): Promise<void> {
  while (tasks.size > 0) await Promise.allSettled([...tasks]);
}

/**
 * Models an abort-capable native operation, including cancellation before invocation begins.
 * @param signal - Cancellation owned by the accepted run's generation.
 * @returns A Promise that rejects with the signal's original reason when cancelled.
 * @throws If no cancellation signal is supplied, or with its reason when already aborted.
 * @example See the before/after invocation cases in `agent-rpc.test.ts`.
 */
export async function awaitFixtureCancellation(signal: AbortSignal | undefined): Promise<never> {
  if (signal === undefined) throw new Error("The fixture requires a run cancellation signal.");
  signal.throwIfAborted();
  return new Promise<never>((_, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}
