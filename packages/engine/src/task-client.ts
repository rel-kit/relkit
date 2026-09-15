import type { MaybePromise } from "@relkit/contracts";
import type { DependencyBridgeOptions, DependencyClientBuildOptions } from "./dependencies.js";
import { DependencyNotConfiguredError } from "./dependency-clients.js";

export function createTaskDependencyClient(
  name: string,
  source: unknown,
  options: DependencyClientBuildOptions,
  taskId: string,
): { readonly trigger: (input: unknown, request?: Readonly<Record<string, unknown>>) => Promise<unknown> } {
  if (source !== undefined && !isTrigger(source) && typeof source !== "function") {
    throw new TypeError(`Invalid task client "${name}"`);
  }
  const trigger = (input: unknown, request: Readonly<Record<string, unknown>> = {}) => {
    const signal = options.signal?.();
    const bridgeOptions: DependencyBridgeOptions = {
      name: `relkit.task.${taskId}.trigger`,
      attributes: { "relkit.task.id": taskId },
      ...(signal === undefined ? {} : { signal }),
      input,
      kind: "producer",
    };
    const work = (): MaybePromise<unknown> => {
      if (source === undefined && options.invokeTask === undefined) {
        throw new DependencyNotConfiguredError("tasks", name);
      }
      const value: Readonly<Record<string, unknown>> = {
        ...request,
        ...(request.signal === undefined && signal !== undefined ? { signal } : {}),
      };
      if (options.invokeTask !== undefined) {
        return options.invokeTask({
          taskId,
          name,
          declaration: options.dependencies?.tasks?.[name] ?? {},
          source,
          input,
          options: value,
          ...(signal === undefined ? {} : { signal }),
        });
      }
      if (isTrigger(source)) return source.trigger(input, value);
      return (source as (input: unknown, options: unknown) => MaybePromise<unknown>)(input, value);
    };
    return options.bridge === undefined
      ? Promise.resolve().then(work)
      : options.bridge.run(work, bridgeOptions);
  };
  return Object.freeze({ trigger });
}

function isTrigger(value: unknown): value is { readonly trigger: (input: unknown, options?: unknown) => MaybePromise<unknown> } {
  return value !== null && typeof value === "object" && typeof (value as { trigger?: unknown }).trigger === "function";
}
