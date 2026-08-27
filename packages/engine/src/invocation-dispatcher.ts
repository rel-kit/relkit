import {
  currentInvocationScope,
  resolveDescriptorIdentity,
  type InvocationDispatchOptions,
  type InvocationDispatchRequest,
  type InvocationDispatcher,
  type InvocationTarget as SharedInvocationTarget,
} from "@relkit/invocation";
import type { ObservedEdge } from "@relkit/graph";
import type { InvocationContext, InvocationTarget, InvokeOptions } from "./invoke-types.js";

/** Adapts the generation-aware engine to the dependency-neutral dispatch scope. */
export function createEngineDispatcher<
  BaseInput = unknown,
  BaseOutput = unknown,
  BaseContext extends { readonly signal: AbortSignal } = InvocationContext,
>(
  baseOptions: InvokeOptions<BaseInput, BaseOutput, BaseContext>,
  run: (options: InvokeOptions<BaseInput, BaseOutput, BaseContext>) => Promise<unknown>,
  onObservedEdge?: (edge: ObservedEdge) => void,
): InvocationDispatcher {
  const dispatcher: InvocationDispatcher = {
    dispatch: <Input, Output, Context extends { readonly signal: AbortSignal } = InvocationContext>(
      request: InvocationDispatchRequest<Input, Output, Context>,
    ): Promise<Output> => {
      const requestOptions = request.options;
      const active = currentInvocationScope();
      const parent = requestOptions?.parent ?? baseOptions.parent ?? active?.parent;
      const identity = resolveDescriptorIdentity(request.target);
      const callerId = active?.chain?.frames.at(-1)?.functionId;
      if (callerId !== undefined) {
        notify(onObservedEdge, {
          relationship: "calls-function",
          from: callerId,
          to: identity.id,
        });
      }
      const target = resolveGenerationTarget(request.target, baseOptions.registry);
      return run({
        ...baseOptions,
        ...engineOptions(requestOptions),
        target: target as unknown as InvocationTarget<BaseInput, BaseOutput, BaseContext>,
        input: request.input as BaseInput,
        source: requestOptions?.source ?? "direct",
        ...(parent === undefined ? {} : { parent }),
      } as InvokeOptions<BaseInput, BaseOutput, BaseContext>) as Promise<Output>;
    },
  };
  return Object.freeze(dispatcher);
}

function notify(hook: ((edge: ObservedEdge) => void) | undefined, edge: ObservedEdge): void {
  try {
    hook?.(edge);
  } catch {
    // Observed-edge telemetry cannot replace the child invocation.
  }
}

function resolveGenerationTarget<Input, Output, Context extends { readonly signal: AbortSignal }>(
  target: SharedInvocationTarget<Input, Output, Context>,
  registry: InvokeOptions["registry"],
): InvocationTarget<Input, Output, Context> {
  if (registry === undefined) return target as InvocationTarget<Input, Output, Context>;
  const identity = resolveDescriptorIdentity(target);
  const handler = registry.get(identity.id);
  if (handler === undefined) {
    throw new TypeError(`Function handler is not registered: ${identity.id}`);
  }
  return {
    ...(target as InvocationTarget<Input, Output, Context>),
    id: identity.id,
    handler: handler as InvocationTarget<Input, Output, Context>["handler"],
  };
}

function engineOptions<Context extends { readonly signal: AbortSignal }>(
  options: InvocationDispatchOptions<Context> | undefined,
): Partial<InvokeOptions<unknown, unknown, Context>> {
  if (options === undefined) return {};
  return {
    ...(options.correlationId === undefined ? {} : { correlationId: options.correlationId }),
    ...(options.traceId === undefined ? {} : { traceId: options.traceId }),
    ...(options.deadlineMs === undefined ? {} : { deadlineMs: options.deadlineMs }),
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    ...(options.toolHooks === undefined ? {} : { toolHooks: options.toolHooks }),
    ...(options.env === undefined ? {} : { env: options.env }),
    ...(options.clients === undefined ? {} : { clients: options.clients }),
    ...(options.servicePolicies === undefined ? {} : { servicePolicies: options.servicePolicies }),
    ...(options.effectRunner === undefined ? {} : { effectRunner: options.effectRunner }),
    ...(options.idSource === undefined ? {} : { idSource: options.idSource }),
  };
}
