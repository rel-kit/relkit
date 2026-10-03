import type { TaskContextBase, TaskDescriptorAny } from "@relkit/jobs";
import type { DependencyDeclarations } from "./dependencies.types.js";
import type { InvocationTarget } from "./invoke-types.js";
import type { TaskExecutorOptions } from "./task-executor.types.js";

/**
 * Adapts a registered native task to the shared invocation kernel.
 * @param task - Task descriptor whose handler and schemas remain authoritative.
 * @param options - Generation publication metadata.
 * @returns A target retaining validation, declared dependencies and publication contracts.
 */
export function taskTarget(
  task: TaskDescriptorAny,
  options: TaskExecutorOptions,
): InvocationTarget<unknown, unknown, TaskContextBase> {
  return {
    id: `task.${task.id}`,
    input: task.input,
    output: task.output,
    ...(task.dependencies === undefined
      ? {}
      : { dependencies: task.dependencies as unknown as DependencyDeclarations }),
    ...(options.publications === undefined ? {} : { publications: options.publications }),
    ...(task.publishes === undefined ? {} : { publishes: task.publishes }),
    handler: (input, context) =>
      (task.handler as (value: never, context: TaskContextBase) => unknown)(
        input as never,
        context as TaskContextBase,
      ),
  };
}
