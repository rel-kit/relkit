import { AsyncLocalStorage } from "node:async_hooks";
import type { InvocationDispatchScope } from "./dispatcher-types.js";
import type { ExecutionContext } from "./execution-context.js";

const storage = new AsyncLocalStorage<InvocationDispatchScope>();

export function currentInvocationScope(): InvocationDispatchScope | undefined {
  return storage.getStore();
}

export function runInInvocationScope<A>(scope: InvocationDispatchScope, callback: () => A): A {
  const execution = scope.execution ?? currentExecutionContext();
  return storage.run(Object.freeze({ ...scope, ...(execution ? { execution } : {}) }), callback);
}

export function currentExecutionContext(): ExecutionContext | undefined {
  return storage.getStore()?.execution;
}

export function runInExecutionContext<A>(context: ExecutionContext, callback: () => A): A {
  return storage.run(
    Object.freeze({ ...storage.getStore(), execution: Object.freeze({ ...context }) }),
    callback,
  );
}

export function runDetachedExecution<A>(callback: () => A): A {
  return storage.run(Object.freeze({}), callback);
}
