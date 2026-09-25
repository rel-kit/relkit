import { AsyncLocalStorage } from "node:async_hooks";
import { Context, Effect, Layer, Option } from "effect";
import { observeInvocation, runInvocationSync } from "./invocation-observability.js";
import type {
  ExecutionContext,
  InvocationDispatchScope,
  InvocationScopeStorageService,
  TaskAncestry,
} from "./dispatcher-scope.types.js";

/** Substitutable carrier for invocation and execution scopes.
 * @example Effect.provide(currentInvocationScopeEffect(), InvocationScopeStorageLive);
 */
export class InvocationScopeStorage extends Context.Service<
  InvocationScopeStorage,
  InvocationScopeStorageService
>()("relkit/invocation/InvocationScopeStorage") {}

const storage = new AsyncLocalStorage<InvocationDispatchScope>();
const liveStorage: InvocationScopeStorageService = {
  current: () => storage.getStore(),
  run: (scope, callback) => storage.run(scope, callback),
};

/** Live AsyncLocalStorage scope carrier.
 * @example Effect.runSync(Effect.provide(currentInvocationScopeEffect(), InvocationScopeStorageLive));
 */
export const InvocationScopeStorageLive = Layer.succeed(InvocationScopeStorage, liveStorage);

/** Reads the active invocation dispatch scope through Effect.
 * @returns The current scope or undefined; no expected failure.
 * @example Effect.runSync(currentInvocationScopeEffect());
 */
export function currentInvocationScopeEffect(): Effect.Effect<InvocationDispatchScope | undefined> {
  return observeInvocation("scope.current", withStorage((carrier) => carrier.current()));
}

/** Synchronous scope reader compatibility adapter.
 * @returns The current scope or undefined.
 * @example currentInvocationScope();
 */
export function currentInvocationScope(): InvocationDispatchScope | undefined {
  return runInvocationSync(currentInvocationScopeEffect());
}

/** Runs a callback with an invocation scope through Effect.
 * @param scope - Dispatch scope to install.
 * @param callback - Work to run, possibly returning a Promise.
 * @returns The callback result; callback failures are defects.
 * @example Effect.runSync(runInInvocationScopeEffect({ dispatcher }, () => 1));
 */
export function runInInvocationScopeEffect<A>(
  scope: InvocationDispatchScope,
  callback: () => A,
): Effect.Effect<A> {
  return observeInvocation(
    "scope.run",
    withStorage((carrier) => {
      const execution = scope.execution ?? carrier.current()?.execution;
      return carrier.run(Object.freeze({ ...scope, ...(execution ? { execution } : {}) }), callback);
    }),
  );
}

/** Synchronous invocation scope compatibility adapter.
 * @param scope - Dispatch scope to install.
 * @param callback - Work to run in that scope.
 * @returns The callback result, including a returned Promise.
 * @throws The callback's original defect.
 * @example runInInvocationScope({ dispatcher }, () => dispatcher.dispatch(request));
 */
export function runInInvocationScope<A>(scope: InvocationDispatchScope, callback: () => A): A {
  return runInvocationSync(runInInvocationScopeEffect(scope, callback));
}

/** Reads the active execution context through Effect.
 * @returns The current execution context or undefined.
 * @example Effect.runSync(currentExecutionContextEffect());
 */
export function currentExecutionContextEffect(): Effect.Effect<ExecutionContext | undefined> {
  return observeInvocation("scope.execution-current", withStorage((carrier) => carrier.current()?.execution));
}

/** Synchronous execution context reader.
 * @returns The current execution context or undefined.
 * @example currentExecutionContext();
 */
export function currentExecutionContext(): ExecutionContext | undefined {
  return runInvocationSync(currentExecutionContextEffect());
}

/** Reads the active task ancestry through Effect.
 * @returns The current ancestry or undefined.
 * @example Effect.runSync(currentTaskAncestryEffect());
 */
export function currentTaskAncestryEffect(): Effect.Effect<TaskAncestry | undefined> {
  return observeInvocation("scope.ancestry-current", withStorage((carrier) => carrier.current()?.taskAncestry));
}

/** Synchronous task ancestry reader.
 * @returns The current ancestry or undefined.
 * @example currentTaskAncestry();
 */
export function currentTaskAncestry(): TaskAncestry | undefined {
  return runInvocationSync(currentTaskAncestryEffect());
}

/** Runs work with an immutable task ancestry through Effect.
 * @param ancestry - Task lineage to install.
 * @param callback - Work to run in that lineage.
 * @returns The callback result; callback failures are defects.
 * @example Effect.runSync(runInTaskAncestryEffect({ runId: "r", taskId: "t" }, () => 1));
 */
export function runInTaskAncestryEffect<A>(ancestry: TaskAncestry, callback: () => A): Effect.Effect<A> {
  return observeInvocation(
    "scope.ancestry-run",
    withStorage((carrier) =>
      carrier.run(
        Object.freeze({ ...carrier.current(), taskAncestry: Object.freeze({ ...ancestry }) }),
        callback,
      ),
    ),
  );
}

/** Synchronous task ancestry compatibility adapter.
 * @param ancestry - Task lineage to install.
 * @param callback - Work to run in that lineage.
 * @returns The callback result.
 * @throws The callback's original defect.
 * @example runInTaskAncestry({ runId: "r", taskId: "t" }, () => 1);
 */
export function runInTaskAncestry<A>(ancestry: TaskAncestry, callback: () => A): A {
  return runInvocationSync(runInTaskAncestryEffect(ancestry, callback));
}

/** Runs work with a copied execution context through Effect.
 * @param context - Trace and request context to install.
 * @param callback - Work to run in that context.
 * @returns The callback result; callback failures are defects.
 * @example Effect.runSync(runInExecutionContextEffect(context, () => 1));
 */
export function runInExecutionContextEffect<A>(context: ExecutionContext, callback: () => A): Effect.Effect<A> {
  return observeInvocation(
    "scope.execution-run",
    withStorage((carrier) =>
      carrier.run(
        Object.freeze({ ...carrier.current(), execution: Object.freeze({ ...context }) }),
        callback,
      ),
    ),
  );
}

/** Synchronous execution context compatibility adapter.
 * @param context - Trace and request context to install.
 * @param callback - Work to run in that context.
 * @returns The callback result.
 * @throws The callback's original defect.
 * @example runInExecutionContext(context, () => currentExecutionContext());
 */
export function runInExecutionContext<A>(context: ExecutionContext, callback: () => A): A {
  return runInvocationSync(runInExecutionContextEffect(context, callback));
}

/** Runs work without inherited execution or task scope through Effect.
 * @param callback - Detached work to run.
 * @returns The callback result; callback failures are defects.
 * @example Effect.runSync(runDetachedExecutionEffect(() => 1));
 */
export function runDetachedExecutionEffect<A>(callback: () => A): Effect.Effect<A> {
  return observeInvocation("scope.detached-run", withStorage((carrier) => carrier.run(Object.freeze({}), callback)));
}

/** Synchronous detached execution compatibility adapter.
 * @param callback - Detached work to run.
 * @returns The callback result.
 * @throws The callback's original defect.
 * @example runDetachedExecution(() => currentExecutionContext());
 */
export function runDetachedExecution<A>(callback: () => A): A {
  return runInvocationSync(runDetachedExecutionEffect(callback));
}

/** Evaluates one scope operation against an injected carrier. */
function withStorage<A>(evaluate: (carrier: InvocationScopeStorageService) => A): Effect.Effect<A> {
  return Effect.flatMap(Effect.serviceOption(InvocationScopeStorage), (provided) =>
    Effect.sync(() => evaluate(Option.isSome(provided) ? provided.value : liveStorage)),
  );
}
