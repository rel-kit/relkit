import type { FunctionRequest } from "@zsys/contracts";
import {
  runServicePolicy,
  type InvocationRunner,
  type InvocationServicePolicy,
} from "@zsys/invocation";
import type { invokeUserHandler } from "@zsys/invocation";

type HandlerEffect = ReturnType<typeof invokeUserHandler>;

export function runServiceHandler(
  policy: InvocationServicePolicy,
  input: unknown,
  request: FunctionRequest | undefined,
  context: unknown,
  handler: (context: unknown) => HandlerEffect,
  runner: InvocationRunner,
  signal: AbortSignal,
): Promise<unknown> {
  return runServicePolicy(policy, input, request, context, (serviceContext) =>
    runner.run(handler(serviceContext), { signal }),
  );
}
