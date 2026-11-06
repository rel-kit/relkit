/** The runtime handle lookup: `getRelkit()` reads the running application's handle from
 * asynchronous invocation context, never from a process global, so two applications in one
 * process each see only their own handle.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { RelkitHandle } from "./runtime-handle.types.js";
export type * from "./runtime-handle.types.js";

const activeHandle = new AsyncLocalStorage<RelkitHandle>();

/** Raised by `getRelkit()` when the calling code does not run inside an application.
 * @example try { getRelkit() } catch (error) { if (error instanceof ApplicationNotRunningError) … }
 */
export class ApplicationNotRunningError extends Error {
  readonly code = "RELKIT_APPLICATION_NOT_RUNNING" as const;

  constructor() {
    super(
      "No RelKit application is running in this context. getRelkit() works inside a running application, such as in raw routes, middleware and onStart; in a script, call createRelkit(config) instead.",
    );
    this.name = "ApplicationNotRunningError";
  }
}

/** Returns the handle of the application this code runs in.
 * @returns The running application's typed clients.
 * @throws ApplicationNotRunningError when no application is running in this context.
 * @example const recent = await getRelkit().database.orders.findMany({ limit: 10 });
 */
export function getRelkit(): RelkitHandle {
  const handle = activeHandle.getStore();
  if (handle === undefined) throw new ApplicationNotRunningError();
  return handle;
}

/** Runs code with a handle as the result of `getRelkit()`, including in its async continuations.
 * @param handle - The application's handle.
 * @param run - Code to run.
 * @returns What `run` returns.
 * @example runWithRelkit(handle, () => server.fetch(request));
 */
export function runWithRelkit<T>(handle: RelkitHandle, run: () => T): T {
  return activeHandle.run(handle, run);
}
