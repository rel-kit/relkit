import type { MaybePromise } from "../contracts/index.js";
import type { DependencyBridgeOptions, DependencyClientBuildOptions } from "./dependencies.js";
import { notify } from "./edge-hooks.js";
import { DependencyNotConfiguredError } from "./dependency-errors.js";

type TriggerSource = {
  readonly trigger: (input: unknown, options?: unknown) => MaybePromise<unknown>;
};

/** Bridge a declared job so handlers trigger its task through the job's native runtime.
 * @returns A client whose `trigger` resolves to the run handle the jobs runtime accepted.
 * @param name - Declared dependency name.
 * @param source - The job descriptor or a native trigger source.
 * @param options - Explicit configuration and dependencies for this operation.
 * @param jobId - Canonical job identifier recorded on the producer span and edge.
 */
export function createJobDependencyClient(
  name: string,
  source: unknown,
  options: DependencyClientBuildOptions,
  jobId: string,
): {
  readonly trigger: (
    input: unknown,
    request?: Readonly<Record<string, unknown>>,
  ) => Promise<unknown>;
} {
  if (source !== undefined && !isTrigger(source) && typeof source !== "function") {
    throw new TypeError(`Invalid job client "${name}"`);
  }
  /** Trigger the declared job while propagating the current invocation's cancellation and trace.
   * @param input - Task input validated by the jobs runtime.
   * @param request - Trigger options such as `operationId` or `delay`.
   * @returns A Promise of the accepted run handle.
   */
  const trigger = (input: unknown, request: Readonly<Record<string, unknown>> = {}) => {
    const signal = options.signal?.();
    notify(options.onObservedEdge, {
      relationship: "enqueues-job",
      from: options.ownerId,
      to: jobId,
    });
    const bridgeOptions: DependencyBridgeOptions = {
      name: `relkit.job.${jobId}.trigger`,
      attributes: { "relkit.job.id": jobId },
      ...(signal === undefined ? {} : { signal }),
      input,
      kind: "producer",
    };
    const work = (): MaybePromise<unknown> => {
      if (source === undefined) throw new DependencyNotConfiguredError("jobs", name);
      const value: Readonly<Record<string, unknown>> = {
        ...request,
        ...(request.signal === undefined && signal !== undefined ? { signal } : {}),
      };
      if (isTrigger(source)) return source.trigger(input, value);
      return (source as (input: unknown, options: unknown) => MaybePromise<unknown>)(input, value);
    };
    return options.bridge === undefined
      ? Promise.resolve().then(work)
      : options.bridge.run(work, bridgeOptions);
  };
  return Object.freeze({ trigger });
}

/** Recognize a value that can trigger a job.
 * @returns Whether the value has a `trigger` method.
 * @param value - Native value being checked.
 */
function isTrigger(value: unknown): value is TriggerSource {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { trigger?: unknown }).trigger === "function"
  );
}
