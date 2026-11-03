export type { InvocationDispatchScope, TaskAncestry } from "./dispatcher.types.js";
export type { ExecutionContext } from "./execution-context.types.js";
import type { InvocationDispatchScope } from "./dispatcher.types.js";

/** Substitutable invocation scope carrier, normally backed by AsyncLocalStorage.
 * A test Layer can isolate nested dispatch scope without global mutation.
 * @example const layer = Layer.succeed(InvocationScopeStorage, storage);
 */
export interface InvocationScopeStorageService {
  /** Reads the current scope.
   * @returns The active invocation scope, if any.
   * @example storage.current();
   */
  readonly current: () => InvocationDispatchScope | undefined;
  /** Runs one callback under an invocation scope.
   * @param scope - Scope to install.
   * @param callback - Work to run in that scope.
   * @returns The callback result, including a returned Promise.
   * @example storage.run({ dispatcher }, () => 1);
   */
  readonly run: <A>(scope: InvocationDispatchScope, callback: () => A) => A;
}
