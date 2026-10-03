import type { InvocationContextOptions, InvocationRecord, PublicClock } from "@relkit/invocation";
import type { TaskContextBase, TaskDescriptorAny } from "@relkit/jobs";
import type { TaskExecutionBinding } from "@relkit/jobs/adapter";
import type { DependencyClientSources, DirectTaskInvoker } from "./dependencies.js";

/** Native execution binding and clients used to construct a guarded task context. */
export interface TaskContextMaterializationOptions {
  readonly task: TaskDescriptorAny;
  readonly binding: TaskExecutionBinding;
  readonly record: InvocationRecord;
  readonly signal: AbortSignal;
  readonly env: Readonly<Record<string, unknown>>;
  readonly time: PublicClock;
  readonly context?: (
    options: InvocationContextOptions,
  ) => Promise<TaskContextBase> | TaskContextBase;
  readonly clients?: DependencyClientSources;
  readonly invokeTask?: DirectTaskInvoker;
  readonly publications?: Readonly<Record<string, import("./dependencies.js").DependencyRefLike>>;
}
