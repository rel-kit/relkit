import type { AgentRunSupervisionOptions } from "./agent-run-supervision.types.js";
export type { AgentRunSupervisionOptions } from "./agent-run-supervision.types.js";
import { Context, Effect, Layer, ManagedRuntime, Schedule } from "effect";
import { httpBoundary, observeHttp } from "./http-effect.js";
import { currentHttpContextLayer } from "./http-logging.js";
import { withNativeEffectContext } from "@relkit/runtime-effect";

/** Keeps claim renewal and control observation alive for the run's entire scope. */
export class AgentRunSupervision extends Context.Service<
  AgentRunSupervision,
  {
    readonly ready: true;
  }
>()("@relkit/runtime-hono/AgentRunSupervision") {}

/** Builds a fresh scope for a run, including sequential, non-overlapping renewal.
 * @param options - Application dependencies and configuration for this domain.
 * @returns A scoped layer that joins renewal and control observation on disposal.
 */
export function agentRunSupervisionLayer(options: AgentRunSupervisionOptions) {
  return Layer.effect(
    AgentRunSupervision,
    Effect.gen(function* () {
      /** Renews the execution claim, stopping the run after a provider failure.
       * @returns A lazy renewal effect that logs and requests cancellation on failure.
       */
      const renew = Effect.fn("AgentRunSupervision.renew")(() =>
        observeHttp("agent.claim.renew", httpBoundary("agent.claim.renew", options.renew)).pipe(
          Effect.catch((error) =>
            Effect.logWarning("Agent claim renewal failed; stopping its run").pipe(
              Effect.andThen(Effect.sync(() => options.abort(error.cause))),
            ),
          ),
        ),
      );
      yield* renew().pipe(
        Effect.repeat(Schedule.spaced(15_000)),
        Effect.delay(15_000),
        Effect.forkScoped,
      );
      const controls = Effect.acquireUseRelease(
        Effect.withFiber((fiber) =>
          Effect.sync(() => {
            const controller = new AbortController();
            return {
              controller,
              task: withNativeEffectContext(fiber.context, () =>
                options.controls(controller.signal),
              ),
            };
          }),
        ),
        ({ task }) => httpBoundary("agent.controls", () => task),
        ({ controller, task }) =>
          Effect.promise(async () => {
            controller.abort();
            await task.catch(() => undefined);
          }),
      );
      yield* controls.pipe(
        Effect.catch(() =>
          Effect.logWarning("Agent control observation ended after a provider failure"),
        ),
        Effect.forkScoped,
      );
      return { ready: true as const };
    }),
  );
}

/** Promise boundary for the generation worker; always dispose in its finally block.
 * @param options - Application dependencies and configuration for this domain.
 * @returns A disposal callback that interrupts and joins the owned supervisor.
 */
export async function startAgentSupervision(
  options: AgentRunSupervisionOptions,
): Promise<() => Promise<void>> {
  const runtime = ManagedRuntime.make(
    agentRunSupervisionLayer(options).pipe(Layer.provideMerge(currentHttpContextLayer())),
  );
  await runtime.context();
  return () => runtime.dispose();
}
