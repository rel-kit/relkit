import { createHash } from "node:crypto";
import { createDeepAgentBucketBackend } from "./deepagent-bucket-backend.js";
import type { DeepAgentBucketClient } from "./deepagent-bucket-files.js";

/** Creates a private DeepAgents filesystem partition for one exact agent thread. */
export function createThreadBucketBackend(
  bucket: DeepAgentBucketClient,
  agentId: string,
  threadId: string,
) {
  if (typeof threadId !== "string" || threadId.length === 0) {
    throw new TypeError("DeepAgents bucket backend requires threadId");
  }
  return createDeepAgentBucketBackend(bucket, {
    prefix: `agents/${digest(agentId)}/threads/${digest(threadId)}`,
  });
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
