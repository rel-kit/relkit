import { Context, Layer } from "effect";
import type { DeepAgentBucketContext } from "./deepagent-bucket-files.types.js";

/** Injectable bucket context for DeepAgents filesystem operations.
 * @example Effect.provide(listDirectoryEffect("/"), deepAgentBucketLayer(context));
 */
export class DeepAgentBucket extends Context.Service<DeepAgentBucket, DeepAgentBucketContext>()(
  "relkit/agents/DeepAgentBucket",
) {}

/** Provides one bucket client and path prefix to an Effect operation.
 * @param context - Validated bucket and prefix.
 * @returns A Layer with the bucket service.
 * @example deepAgentBucketLayer({ bucket, prefix: "threads/one" });
 */
export function deepAgentBucketLayer(context: DeepAgentBucketContext) {
  return Layer.succeed(DeepAgentBucket, context);
}
