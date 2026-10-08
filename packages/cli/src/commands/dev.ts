import { Effect } from "effect";
import { cliTry } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import { makeDevSessionEngineEffect } from "./dev-session-engine.js";
import { DevSession } from "./dev-session.js";
import type { DevOptions } from "./dev.types.js";
export type {
  DevActivationFingerprint,
  DevLog,
  DevLogEvent,
  DevLocalServices,
  DevOptions,
} from "./dev.types.js";
export { DevSession } from "./dev-session.js";

/**
 * Acquires a session in the caller's native lifetime.
 * @param options - Explicit compiler, output, process and logging policy.
 * @returns Started facade with captured native operations; Scope release joins shutdown.
 */
export const acquireDevSessionEffect = Effect.fn("Dev.session")(
  function* (options: DevOptions) {
    const session = yield* cliTry("dev.session.create", () => new DevSession(options));
    const engine = yield* makeDevSessionEngineEffect(session);
    yield* engine.start;
    return session;
  },
  (effect, _options: DevOptions) => observeCli("dev.session.acquire", effect),
);

/** Starts and returns the manually owned public development session.
 * @param options - Development policy.
 * @returns Public manually owned session.
 */
export function startDev(options: DevOptions): Promise<DevSession> {
  return new DevSession(options).start();
}
/** Runs development until the session's scoped shutdown completes.
 * @param options - Development policy.
 * @returns Completion after joined session shutdown.
 */
export async function runDev(options: DevOptions): Promise<void> {
  const session = await startDev(options);
  try {
    await session.waitForShutdown();
  } finally {
    await session.stop();
  }
}
