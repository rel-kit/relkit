import type { InvocationContextOptions } from "@relkit/engine";

const noop = (): void => undefined;
const log = Object.freeze({ trace: noop, debug: noop, info: noop, warn: noop, error: noop });

export function createTestContextFactory(patch: Readonly<Record<string, unknown>>) {
  return ({ invocation, signal, env, time }: InvocationContextOptions) =>
    Object.freeze({
      invocation,
      signal,
      env,
      time,
      log,
      jobs: Object.freeze({}),
      events: Object.freeze({}),
      buckets: Object.freeze({}),
      cache: Object.freeze({}),
      agents: Object.freeze({}),
      database: Object.freeze({}),
      auth: Object.freeze({ getSession: () => Promise.resolve(null) }),
      constants: Object.freeze({}),
      prompts: Object.freeze({}),
      ...patch,
    });
}
