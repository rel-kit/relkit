/**
 * NF-17: when the caller's signal aborts while a channel stream waits for the next event, the
 * stream ends; a client going away is not a failed operation, so nothing is logged as an error.
 * The stream is read directly so that the abort, not the consumer's early return, ends it: over
 * HTTP the two race, and the audit saw the abort win.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Logger } from "effect";
import { createLocalRealtimeProvider } from "relkit/providers-local";
import { defineChannel } from "relkit/realtime";
import { z } from "relkit/schema";
import { withNativeEffectContext } from "../../../packages/relkit/src/runtime-effect/index.ts";
import type { RouteMaterializationOptions } from "../../../packages/relkit/src/runtime-hono/materialize-routes.ts";
import { observeRealtime } from "../../../packages/relkit/src/runtime-hono/realtime-observation.ts";
import type { RpcContext } from "../../../packages/relkit/src/runtime-hono/rpc.ts";
import {
  channelPlan,
  manifest,
} from "../../../packages/relkit/tests/runtime-hono/fixtures/channel-plan.ts";

const channel = defineChannel({
  id: "orders.updates",
  params: z.object({ id: z.string() }),
  events: { changed: z.object({ value: z.number() }) },
  client: { authorize: () => true },
  replay: { retentionMs: 300_000, maxEvents: 100 },
});

/** How the aborted stream ended and what was logged meanwhile. */
export interface CancelledWait {
  readonly ended: "done" | "threw";
  readonly logs: readonly { readonly level: string; readonly message: string }[];
}

/**
 * Reads a channel stream to `caught-up`, then aborts its signal while it waits.
 * @returns How the iteration ended and the logs at info level and above.
 */
export async function cancelWhileWaiting(): Promise<CancelledWait> {
  const root = await mkdtemp(join(tmpdir(), "relkit-realtime-cancel-"));
  const provider = createLocalRealtimeProvider(root, { pollingMs: 50 });
  const plan = channelPlan();
  const options = {
    plan,
    manifest: manifest(plan, channel),
    engine: { invoke: async () => undefined },
    clientIdentity: {
      applicationId: "fixture",
      publicFingerprint: "sha256:public",
      resolve: () => ({ identityScope: "viewer", sessionEpoch: "session" }),
    },
    realtime: { applicationId: "fixture", environment: "test", provider: () => provider },
  } as unknown as RouteMaterializationOptions;
  const context = {
    hono: { req: { raw: new Request("http://relkit.test/_relkit/v1/rpc") } },
  } as unknown as RpcContext;
  const logs: { level: string; message: string }[] = [];
  const logger = Logger.make((event) =>
    logs.push({ level: event.logLevel, message: String(event.message) }),
  );
  const logged = Effect.runSync(
    Effect.context<never>().pipe(Effect.provide(Logger.layer([logger]))),
  );
  const caller = new AbortController();
  let ended: CancelledWait["ended"] = "done";
  try {
    await withNativeEffectContext(logged, async () => {
      const stream = observeRealtime(
        {
          channel: channel.id,
          params: { id: "one" },
          expectedIdentity: { identityScope: "viewer", sessionEpoch: "session" },
        } as never,
        context,
        options,
        caller.signal,
      );
      try {
        for await (const frame of stream)
          if (frame.kind === "caught-up") setTimeout(() => caller.abort(), 100);
      } catch {
        ended = "threw";
      }
    });
    // The observer logs as the stream's cleanup finishes.
    await new Promise((resolve) => setTimeout(resolve, 50));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
  return { ended, logs: logs.filter((log) => log.level !== "Debug" && log.level !== "Trace") };
}
