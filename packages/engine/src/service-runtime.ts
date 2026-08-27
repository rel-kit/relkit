import {
  runServicePolicy,
  type InvocationRunner,
  type InvocationServicePolicy,
} from "@relkit/invocation";
import type { invokeUserHandler } from "@relkit/invocation";

type HandlerEffect = ReturnType<typeof invokeUserHandler>;

export function runServiceHandler(
  policy: InvocationServicePolicy,
  input: unknown,
  context: unknown,
  handler: (context: unknown) => HandlerEffect,
  runner: InvocationRunner,
  signal: AbortSignal,
): Promise<unknown> {
  return runServicePolicy(policy, input, context, (serviceContext) =>
    runner.run(handler(serviceContext), { signal }),
  );
}
