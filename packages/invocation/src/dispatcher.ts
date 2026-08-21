import { createStandaloneDispatcher } from "./standalone-dispatcher.js";
import { currentInvocationScope, runInInvocationScope } from "./dispatcher-scope.js";
import type {
  InvocationDispatchRequest,
  InvocationDispatcher,
  InvocationDispatchScope,
} from "./dispatcher-types.js";

export function currentInvocationDispatcher(): InvocationDispatcher | undefined {
  return currentInvocationScope()?.dispatcher;
}

export function dispatchInvocation<Input, Output, Context extends { readonly signal: AbortSignal }>(
  request: InvocationDispatchRequest<Input, Output, Context>,
): Promise<Output> {
  return (currentInvocationDispatcher() ?? createStandaloneDispatcher()).dispatch(request);
}

export { currentInvocationScope, runInInvocationScope };
export { createStandaloneDispatcher } from "./standalone-dispatcher.js";
export type {
  InvocationDispatchRequest,
  InvocationDispatcher,
  InvocationDispatchOptions,
  InvocationDispatchScope,
  LocalStructuredLogger,
  ManagedDependencyCategory,
  ManagedDependencySources,
  StandaloneDispatcherOptions,
  StructuredLogRecord,
} from "./dispatcher-types.js";
export { MANAGED_DEPENDENCY_CATEGORIES } from "./dispatcher-types.js";
