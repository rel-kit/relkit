import type { Inngest } from "inngest";
import type { OperationContext } from "@relkit/jobs/adapter";

export async function subscribeInngestRun(
  client: Inngest.Any,
  appId: string,
  runId: string,
  onMessage: () => Promise<void>,
  context: OperationContext,
): Promise<(() => void) | undefined> {
  if (context.signal.aborted) return undefined;
  const channel = `relkit/${appId}/runs/${runId}`;
  const pending = client.realtime.subscribe({
    channel,
    topics: ["status"],
    validate: false,
    onMessage: async (message) => {
      if (message.runId === undefined || message.runId === runId) await onMessage();
    },
    onError: () => undefined,
  });
  let subscription: { readonly unsubscribe: (reason?: string) => void };
  try {
    subscription = await Promise.race([
      pending,
      timeout(1_500, context.signal),
    ]) as typeof subscription;
  } catch {
    void pending.then((value) => value.unsubscribe("Relkit realtime setup timed out"), () => undefined);
    return undefined;
  }
  const abort = () => subscription.unsubscribe("Relkit observation aborted");
  context.signal.addEventListener("abort", abort, { once: true });
  return () => {
    context.signal.removeEventListener("abort", abort);
    subscription.unsubscribe("Relkit observer released");
  };
}

function timeout(milliseconds: number, signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    const timer = setTimeout(() => finish(new Error("Inngest realtime setup timed out")), milliseconds);
    const abort = () => {
      clearTimeout(timer);
      finish(signal.reason ?? new Error("Observation aborted"));
    };
    const finish = (reason: unknown): void => {
      signal.removeEventListener("abort", abort);
      reject(reason);
    };
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
}
