import { applicationProcedure } from "./application-runtime-client";
import type {
  AgentObservation,
  ClientIdentityDocument,
  JournalCheckpoint,
} from "./application-runtime-types";

type ApplicationClient = Parameters<typeof applicationProcedure>[0];

export async function observeAgentThread(options: {
  readonly client: ApplicationClient;
  readonly agentId: string;
  readonly threadId: string;
  readonly identity: ClientIdentityDocument;
  readonly after: JournalCheckpoint;
  readonly signal: AbortSignal;
  readonly onObservation: (observation: AgentObservation) => void;
}): Promise<void> {
  let after = options.after;
  while (!options.signal.aborted) {
    try {
      const stream = (await applicationProcedure(options.client, "relkit.agent.observe")(
        {
          agentId: options.agentId,
          threadId: options.threadId,
          after,
          expectedIdentity: options.identity,
        },
        { signal: options.signal },
      )) as AsyncIterable<AgentObservation>;
      for await (const observation of stream) {
        after =
          observation.kind === "event"
            ? observation.event.checkpoint
            : observation.snapshot.checkpoint;
        options.onObservation(observation);
      }
    } catch (error) {
      if (options.signal.aborted) return;
      if (hasRpcCode(error)) throw error;
    }
    if (options.signal.aborted) return;
    await retryDelay(options.signal);
  }
}

function hasRpcCode(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { readonly code?: unknown }).code === "string"
  );
}

function retryDelay(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, 300);
    signal.addEventListener("abort", done, { once: true });
  });
}
