import { createHash } from "node:crypto";
import { Effect } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import { createDeepAgentBucketBackendEffect } from "./deepagent-bucket-backend.js";
import { deepAgentBucketFailure } from "./deepagent-bucket-error.js";
import type { DeepAgentBucketClient } from "./deepagent-bucket-files.js";

/** Creates a private filesystem partition for one exact agent thread.
 * @param bucket - Bucket client shared by thread backends.
 * @param agentId - Agent identity included in the private prefix.
 * @param threadId - Required thread identity.
 * @returns An Effect with a thread backend or DeepAgentBucketFailure.
 * @example Effect.runSync(createThreadBucketBackendEffect(bucket, "agent", "thread"));
 */
export const createThreadBucketBackendEffect = Effect.fn("Agents.bucket.thread")(
  function* (bucket: DeepAgentBucketClient, agentId: string, threadId: string) {
    const prefix = yield* Effect.try({
      try: () => {
        if (typeof threadId !== "string" || threadId.length === 0) {
          throw new TypeError("DeepAgents bucket backend requires threadId");
        }
        return `agents/${digest(agentId)}/threads/${digest(threadId)}`;
      },
      catch: deepAgentBucketFailure,
    });
    return yield* createDeepAgentBucketBackendEffect(bucket, { prefix });
  },
  (effect) => observeAgent("bucket.thread", effect),
);

/** Creates a private thread backend for existing synchronous callers.
 * @param bucket - Bucket client shared by thread backends.
 * @param agentId - Agent identity included in the private prefix.
 * @param threadId - Required thread identity.
 * @returns A backend scoped to the agent and thread.
 * @throws The original invalid bucket or thread error.
 * @example const backend = createThreadBucketBackend(bucket, "agent", "thread");
 */
export function createThreadBucketBackend(
  bucket: DeepAgentBucketClient,
  agentId: string,
  threadId: string,
) {
  return Effect.runSync(
    createThreadBucketBackendEffect(bucket, agentId, threadId).pipe(
      Effect.catchTag("DeepAgentBucketFailure", (failure) => Effect.fail(failure.cause)),
    ),
  );
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
