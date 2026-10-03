import type { MaybePromise } from "@relkit/contracts";
import type { DependencyBridgeOptions, DependencyClientBuildOptions } from "./dependencies.js";
import { DependencyNotConfiguredError } from "./dependency-clients.js";

/** Bridge declared task submission while retaining native durable execution ownership.
 * @returns A native task submission client with the active invocation propagation.
 * @param name - Declared operation, dependency or field name.
 * @param source - Explicit native source or source collection.
 * @param options - Explicit configuration and dependencies for this operation.
 * @param taskId - Canonical task identifier passed to the durable submitter and producer span.
 */
export function createTaskDependencyClient(
  name: string,
  source: unknown,
  options: DependencyClientBuildOptions,
  taskId: string,
): {
  readonly trigger: (
    input: unknown,
    request?: Readonly<Record<string, unknown>>,
  ) => Promise<unknown>;
} {
  if (source !== undefined && !isTrigger(source) && typeof source !== "function") {
    throw new TypeError(`Invalid task client "${name}"`);
  }
  /** Submit a declared task while propagating the current invocation's cancellation and trace.
   * @param input - Task input forwarded to the authoritative native submitter.
   * @param request - Explicit durable submission options and optional signal.
   * @returns A Promise containing the native task submission result.
   */
  const trigger = (input: unknown, request: Readonly<Record<string, unknown>> = {}) => {
    const signal = options.signal?.();
    const bridgeOptions: DependencyBridgeOptions = {
      name: `relkit.task.${taskId}.trigger`,
      attributes: { "relkit.task.id": taskId },
      ...(signal === undefined ? {} : { signal }),
      input,
      kind: "producer",
    };
    /** Resolve the configured submitter and pass the declared task identity and options.
     * @returns The native submission result, or a missing-dependency error before submission.
     */
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

/** Recognize native durable task submission capability.
 * @returns Whether the native value satisfies this guard.
 * @param value - Native value being validated or projected.
 */
function isTrigger(
  value: unknown,
): value is { readonly trigger: (input: unknown, options?: unknown) => MaybePromise<unknown> } {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { trigger?: unknown }).trigger === "function"
  );
}
