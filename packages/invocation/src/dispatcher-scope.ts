import { AsyncLocalStorage } from "node:async_hooks";
import type { InvocationDispatchScope } from "./dispatcher-types.js";

const storage = new AsyncLocalStorage<InvocationDispatchScope>();

export function currentInvocationScope(): InvocationDispatchScope | undefined {
  return storage.getStore();
}

export function runInInvocationScope<A>(scope: InvocationDispatchScope, callback: () => A): A {
  return storage.run(scope, callback);
}
