import type { InvocationRunner } from "@relkit/invocation";
import { resolveDirectTarget } from "./direct-target.js";
import type { InvokeNext } from "./invoke-now.types.js";
import type { DirectChildInvoker } from "./invoke-runtime.types.js";
import type { InvocationIdSource, InvokeOptions } from "./invoke-types.js";

/** Retain generation dependencies when the shared dispatcher starts a child invocation.
 * @param options - Parent's generation dependencies and hooks.
 * @param invokeNext - Engine invocation boundary supplied to shared dispatch.
 * @param runner - Parent's configured Effect runtime.
 * @param idSource - Generation identity allocator.
 * @param serviceId - Optional owning service identity.
 * @returns A native child callback; @relkit/invocation supplies trace/ancestry authority.
 * @typeParam Input - Validated handler input type.
 * @typeParam Output - Validated handler output type.
 * @typeParam Context - Handler context carrying cancellation authority.
 */
export function createChildInvoker<Input, Output, Context extends { readonly signal: AbortSignal }>(
  options: InvokeOptions<Input, Output, Context>,
  invokeNext: InvokeNext,
  runner: InvocationRunner,
  idSource: InvocationIdSource,
  serviceId: string | undefined,
): DirectChildInvoker {
  return (request, parent) =>
    invokeNext({
      target: resolveDirectTarget<Context>(request, options.registry),
      input: request.input,
      source: "direct",
      parent,
      ...(options.env === undefined ? {} : { env: options.env }),
      ...(options.clients === undefined ? {} : { clients: options.clients }),
      ...(options.invokeTask === undefined ? {} : { invokeTask: options.invokeTask }),
      ...(serviceId === undefined ? {} : { serviceId }),
      ...(options.now === undefined ? {} : { now: options.now }),
      ...(options.admit === undefined ? {} : { admit: options.admit }),
      ...(options.admission === undefined ? {} : { admission: options.admission }),
      ...(options.hooks === undefined ? {} : { hooks: options.hooks }),
      effectRunner: runner,
      idSource,
    });
}
