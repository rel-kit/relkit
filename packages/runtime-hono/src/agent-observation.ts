import { Clock, Context, Effect, Layer, Option, Stream } from "effect";
import { agentClientEvents } from "@relkit/agents";
import { REALTIME_RUNTIME_LIMITS } from "@relkit/contracts";
import { httpBoundary, httpIterable, HttpBoundaryError, observeHttp } from "./http-effect.js";
import { agentContext, requireAgentThreadId, type AgentInput } from "./agent-rpc-support.js";
import { assertExpectedIdentity } from "./rpc-identity.js";
import { clientAgentSnapshot } from "./agent-compatibility.js";
import type { RpcContext } from "./rpc.js";
import type { RouteMaterializationOptions } from "./materialize-routes.js";
import type { AgentObservationFrame } from "./agent-observation.types.js";
import { observeHttpStream } from "./http-stream-observation.js";

/** Builds a journal feed whose waits and iterator scope are owned by its consumer.
 * @param input - Agent identity, thread and required resume checkpoint.
 * @param context - Trusted transport request context.
 * @param options - Active generation and provider configuration.
 * @param signal - Optional transport cancellation signal.
 * @returns A lazy stream with typed native failures and fresh authorization before every frame.
 */
function observation(
  input: AgentInput,
  context: RpcContext,
  options: RouteMaterializationOptions,
  signal?: AbortSignal,
) {
  return Stream.unwrap(
    Effect.gen(function* () {
      const threadId = requireAgentThreadId(input.threadId);
      if (input.after === undefined)
        return yield* Effect.fail(
          new HttpBoundaryError({
            operation: "agent.observe",
            cause: new TypeError("checkpoint is required."),
          }),
        );
      /** Refreshes the principal and checks observation authorization before a page or frame.
       * @returns The currently authorized agent provider scope.
       */
      const authorize = Effect.fn("AgentObservation.authorize")(function* () {
        yield* httpBoundary("agent.observe.identity", () =>
          assertExpectedIdentity(context, options.clientIdentity!, input.expectedIdentity),
        );
        return yield* httpBoundary("agent.observe.authorize", () =>
          agentContext({ ...input, threadId }, context, options, "observe"),
        );
      });
      const initial = yield* authorize();
      const checkpoint = input.after as Parameters<typeof initial.provider.readJournal>[0]["after"];
      return Stream.paginate(
        { after: checkpoint, wait: false },
        Effect.fn("AgentObservation.readPage")(function* (state) {
          if (signal?.aborted) return [[], Option.none<typeof state>()] as const;
          const resolved = yield* authorize();
          if (state.wait) {
            const now = yield* Clock.currentTimeMillis;
            yield* httpBoundary("agent.observe.wait", (fiberSignal) =>
              resolved.provider.waitForJournal({
                ...resolved.scope,
                threadId,
                after: state.after,
                deadlineMs: now + 15_000,
                signal: signal === undefined ? fiberSignal : AbortSignal.any([signal, fiberSignal]),
              }),
            );
          }
          const page = yield* observeHttp(
            "agent.observe.read",
            httpBoundary("agent.observe.read", () =>
              resolved.provider.readJournal({
                ...resolved.scope,
                threadId,
                after: state.after,
                limit: 100,
                maxEncodedBytes: 1024 * 1024,
              }),
            ),
          );
          const frames: AgentObservationFrame[] = [];
          if (page.gap !== undefined) {
            const snapshot = clientAgentSnapshot(
              yield* httpBoundary("agent.observe.snapshot", () =>
                resolved.provider.loadThread({
                  ...resolved.scope,
                  threadId,
                  maxEncodedBytes: REALTIME_RUNTIME_LIMITS.initialSnapshotBytes,
                }),
              ),
            );
            frames.push({ kind: "gap", reason: page.gap, snapshot });
            return [frames, Option.some({ after: snapshot.checkpoint, wait: false })] as const;
          }
          for (const record of page.records)
            for (const event of agentClientEvents(record)) frames.push({ kind: "event", event });
          if (
            page.records.some((record) =>
              ["approval", "control", "terminal", "interruption"].includes(record.kind),
            )
          ) {
            const snapshot = clientAgentSnapshot(
              yield* httpBoundary("agent.observe.snapshot", () =>
                resolved.provider.loadThread({
                  ...resolved.scope,
                  threadId,
                  maxEncodedBytes: REALTIME_RUNTIME_LIMITS.initialSnapshotBytes,
                }),
              ),
            );
            frames.push({ kind: "snapshot", snapshot });
          }
          return [frames, Option.some({ after: page.checkpoint, wait: !page.hasMore })] as const;
        }),
      ).pipe(Stream.mapEffect((frame) => authorize().pipe(Effect.as(frame))));
    }),
  );
}

/** Journal observations preserve fresh authorization, bounded pages and cancellable waits. */
export class AgentObservation extends Context.Service<
  AgentObservation,
  { readonly observe: typeof observation }
>()("@relkit/runtime-hono/AgentObservation") {}

/** Live observation implementation; each consumer owns its stream scope. */
export const AgentObservationLive = Layer.succeed(AgentObservation, {
  observe: (...args) => observeHttpStream("agent.observe", observation(...args)),
});

/** Opens an authorized agent journal at the native transport edge.
 * @param input - Agent identity, thread and checkpoint.
 * @param context - Trusted transport context.
 * @param options - Generation dependencies.
 * @param signal - Optional transport cancellation.
 * @returns A lazy iterable; returning releases its pending provider wait.
 */
export function observeAgent(
  input: AgentInput,
  context: RpcContext,
  options: RouteMaterializationOptions,
  signal?: AbortSignal,
): AsyncIterable<AgentObservationFrame> {
  return httpIterable(
    Stream.unwrap(
      Effect.map(AgentObservation, (service) => service.observe(input, context, options, signal)),
    ).pipe(Stream.provide(AgentObservationLive)),
  );
}
