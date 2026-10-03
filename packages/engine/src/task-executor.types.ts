import type {
  InvocationContextFactory,
  InvocationIdSource,
  InvocationRunner,
} from "@relkit/invocation";
import type { TaskContextBase, TaskDescriptorAny } from "@relkit/jobs";
import type { DependencyClientSources, DirectTaskInvoker } from "./dependencies.js";
import type { FunctionRegistry } from "./registry.js";

/** Verified task lookup and generation dependencies for native envelope execution. */
export interface TaskExecutorOptions {
  readonly tasks:
    Readonly<Record<string, TaskDescriptorAny>> | ReadonlyMap<string, TaskDescriptorAny>;
  readonly registry?: FunctionRegistry;
  readonly clients?: DependencyClientSources;
  readonly invokeTask?: DirectTaskInvoker;
  readonly env?: Readonly<Record<string, unknown>>;
  readonly context?: InvocationContextFactory<TaskContextBase>;
  readonly idSource?: InvocationIdSource;
  readonly effectRunner?: InvocationRunner;
  readonly now?: () => number;
  readonly publications?: Readonly<Record<string, import("./dependencies.js").DependencyRefLike>>;
}
