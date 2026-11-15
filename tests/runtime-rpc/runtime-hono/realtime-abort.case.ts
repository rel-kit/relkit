/**
 * Shared scenario for a realtime channel stream that the caller aborts after a replay and a live
 * event, served over real HTTP so the runtime's own `fetch` carries the event stream.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalRealtimeProvider } from "relkit/providers-local";
import { createProviderRealtimeDispatcher, defineChannel } from "relkit/realtime";
import type { RuntimeAdapter } from "relkit/runtime";
import { createApp } from "relkit/runtime-hono";
import { z } from "relkit/schema";
import {
  channelPlan,
  manifest,
} from "../../../packages/relkit/tests/runtime-hono/fixtures/channel-plan.ts";
import { createFixtureClient } from "./fixture-client.js";

/** Outcome of one aborted channel stream. */
export interface AbortOutcome {
  /** Milliseconds between the abort and the end of `for await`. */
  readonly endedAfterMs: number;
  /** Frames received before the abort, in order. */
  readonly kinds: readonly string[];
  /** Milliseconds between the end of `for await` and the server seeing the request end. */
  readonly releasedAfterMs: number;
}

const channel = defineChannel({
  id: "orders.updates",
  params: z.object({ id: z.string() }),
  events: { changed: z.object({ value: z.number() }) },
  client: { authorize: () => true },
  replay: { retentionMs: 300_000, maxEvents: 100 },
});

/**
 * Starts a realtime application with the given runtime's server.
 * @param serve - The runtime adapter's `serve`.
 * @returns A client, a publisher and a cleanup function.
 */
export async function startRealtimeServer(serve: RuntimeAdapter["serve"]) {
  const root = await mkdtemp(join(tmpdir(), "relkit-realtime-abort-"));
  const provider = createLocalRealtimeProvider(root, { pollingMs: 50 });
  const plan = channelPlan();
  const app = createApp({
    plan,
    manifest: manifest(plan, channel),
    engine: { invoke: async () => undefined },
    clientIdentity: {
      applicationId: "fixture",
      publicFingerprint: "sha256:public",
      resolve: () => ({ identityScope: "viewer", sessionEpoch: "session" }),
    },
    realtime: { applicationId: "fixture", environment: "test", provider: () => provider },
  });
  // The server's view of each subscribe request: its request signal aborts when the client lets go.
  const subscribeSignals: AbortSignal[] = [];
  const server = await serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request) => {
      if (request.url.endsWith("/relkit.realtime.subscribe")) subscribeSignals.push(request.signal);
      return app.fetch(request);
    },
  });
  const dispatcher = createProviderRealtimeDispatcher({
    applicationId: "fixture",
    environment: "test",
    generationId: "generation-a",
    publicFingerprint: "sha256:public",
    provider: () => provider,
  });
  const { presence: _presence, ...published } = channel;
  const publish = (value: number) =>
    dispatcher.trigger({
      channel: published,
      params: { id: "one" },
      event: "changed",
      payload: { value },
    });
  const close = async () => {
    await server.stop(true);
    await rm(root, { recursive: true, force: true });
  };
  return { baseUrl: `http://127.0.0.1:${server.port}`, publish, close, subscribeSignals };
}

/**
 * Subscribes from a checkpoint, takes the replayed events and one live event, aborts, and
 * measures how long `for await` takes to end.
 * @param server - A running realtime server from {@link startRealtimeServer}.
 * @returns How the iteration ended.
 */
export async function abortAfterReplayAndLive(
  server: Awaited<ReturnType<typeof startRealtimeServer>>,
): Promise<AbortOutcome> {
  const client = createFixtureClient({
    baseUrl: server.baseUrl,
    headers: { "x-relkit-identity-scope": "viewer", "x-relkit-session-epoch": "session" },
  });
  const input = { channel: channel.id, params: { id: "one" } };
  const first = await client["relkit.realtime.subscribe"](input);
  let after: unknown;
  for await (const frame of first) {
    after = (frame as { checkpoint?: unknown }).checkpoint;
    if (frame.kind === "caught-up") break;
  }
  await server.publish(1);
  await server.publish(2);
  const caller = new AbortController();
  const kinds: string[] = [];
  let abortedAt = 0;
  const stream = await client["relkit.realtime.subscribe"](
    { ...input, after },
    { signal: caller.signal },
  );
  try {
    for await (const frame of stream) {
      kinds.push(frame.kind);
      if (frame.kind === "caught-up" && kinds.filter((kind) => kind === "event").length === 2)
        await server.publish(3);
      // Abort while the next read is pending, as an application's teardown does. A collection
      // first: signals linked only weakly to the caller's must not lose the abort.
      if (frame.kind === "event" && kinds.filter((kind) => kind === "event").length === 3)
        setTimeout(() => {
          (globalThis as { gc?: () => void }).gc?.();
          abortedAt = performance.now();
          caller.abort();
        }, 20);
    }
  } catch (error) {
    if (!caller.signal.aborted) throw error;
  }
  const endedAt = performance.now();
  const request = server.subscribeSignals.at(-1);
  while (request?.aborted === false && performance.now() - endedAt < 2_000)
    await new Promise((resolve) => setTimeout(resolve, 5));
  return {
    endedAfterMs: endedAt - abortedAt,
    kinds,
    releasedAfterMs: request?.aborted === true ? performance.now() - endedAt : Infinity,
  };
}
