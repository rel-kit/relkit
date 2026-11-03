/**
 * Opens request-owned authorized journal streams through a replaceable Effect
 * service. The native iterable edge preserves scoped waits and cancellation;
 * page projection loads no agent execution or language-model runtime.
 */
import { Context, Effect, Layer, Schema, Stream } from "effect";
import { httpBoundary, httpIterable, HttpBoundaryError } from "./http-effect.js";
import { agentContext, requireAgentThreadId, type AgentInput } from "./agent-rpc-support.js";
import { assertExpectedIdentity } from "./rpc-identity.js";
import { ObservationCheckpoint } from "./agent-observation.schemas.js";
import { readObservationPage } from "./agent-observation-pages.js";
import { observeHttpStream } from "./http-stream-observation.js";
import type { RpcContext } from "./rpc.js";
import type { RouteMaterializationOptions } from "./materialize-routes.js";
import type {
  AgentObservationFrame,
  AgentObservationOperations,
} from "./agent-observation.types.js";

/**
 * Builds a journal feed with fresh authorization before pages and frames.
 * @param input - Request agent/thread identity and submitted checkpoint.
 * @param context - Trusted transport context for this consumer.
 * @param options - Active generation and provider authority.
 * @param signal - Optional native transport cancellation.
 * @returns Lazy scoped stream with typed boundary failures and decoded cursors.
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
        return yield* new HttpBoundaryError({
          operation: "agent.observe",
          cause: new TypeError("checkpoint is required."),
        });
      /** Refreshes request identity and provider authorization. @returns The current authorized provider scope. */
      const authorize = Effect.fn("AgentObservation.authorize")(function* () {
        yield* httpBoundary("agent.observe.identity", () =>
          assertExpectedIdentity(context, options.clientIdentity!, input.expectedIdentity),
        );
        return yield* httpBoundary("agent.observe.authorize", () =>
          agentContext({ ...input, threadId }, context, options, "observe"),
        );
      });
      yield* authorize();
      const checkpoint = yield* Schema.decodeUnknownEffect(ObservationCheckpoint)(input.after).pipe(
        Effect.mapError(
          () =>
            new HttpBoundaryError({
              operation: "agent.observe",
              cause: new TypeError("checkpoint is invalid."),
            }),
        ),
      );
      return Stream.paginate({ after: checkpoint, wait: false }, (state) =>
        readObservationPage(authorize, threadId, state, signal),
      ).pipe(Stream.mapEffect((frame) => authorize().pipe(Effect.as(frame))));
    }),
  );
}

/** Per-request journal observations; service acquisition captures no request context. */
export class AgentObservation extends Context.Service<
  AgentObservation,
  AgentObservationOperations
>()("@relkit/runtime-hono/AgentObservation", {
  make: Effect.sync(
    () =>
      ({
        observe: (...args: Parameters<typeof observation>) =>
          observeHttpStream("agent.observe", observation(...args)),
      }) satisfies AgentObservationOperations,
  ),
}) {}

/** Builds the concrete service; callers can supply the same contract through a test Layer. */
export const AgentObservationLive = Layer.effect(AgentObservation, AgentObservation.make);

/**
 * Opens an authorized journal at the native transport edge.
 * @param input - Submitted agent identity, thread and checkpoint.
 * @param context - Trusted transport context.
 * @param options - Active generation dependencies.
 * @param signal - Optional native cancellation.
 * @returns Lazy iterable; returning joins the pending provider wait through its scope.
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
