import type { DirectFunctionRequest } from "./dependencies.js";
import { unknownSchema } from "./invoke-utils.js";
import type { InvocationTarget, InvokeOptions } from "./invoke-types.js";

export function resolveDirectTarget<Context extends { readonly signal: AbortSignal }>(
  request: DirectFunctionRequest,
  registry: InvokeOptions["registry"],
): InvocationTarget<unknown, unknown, Context> {
  if (isInvocationTarget(request.source)) {
    if (request.source.id !== request.functionId) {
      throw new TypeError(`Function client "${request.name}" targets the wrong function`);
    }
    return request.source as unknown as InvocationTarget<unknown, unknown, Context>;
  }
  const handler =
    typeof request.source === "function" ? request.source : registry?.get(request.functionId);
  if (handler === undefined)
    throw new TypeError(`Function handler is not registered: ${request.functionId}`);
  return {
    id: request.functionId,
    input: request.declaration.input ?? unknownSchema,
    output: request.declaration.output ?? unknownSchema,
    ...(request.declaration.errors === undefined ? {} : { errors: request.declaration.errors }),
    ...(request.declaration.dependencies === undefined
      ? {}
      : { dependencies: request.declaration.dependencies }),
    ...(request.declaration.timeoutMs === undefined
      ? {}
      : { timeoutMs: request.declaration.timeoutMs }),
    ...(request.declaration.concurrency === undefined
      ? {}
      : { concurrency: request.declaration.concurrency }),
    handler: handler as InvocationTarget<unknown, unknown, Context>["handler"],
  };
}

function isInvocationTarget(value: unknown): value is InvocationTarget {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    "input" in candidate &&
    "output" in candidate &&
    typeof candidate.handler === "function"
  );
}
