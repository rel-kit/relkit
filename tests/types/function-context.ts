import type { Effect } from "effect";
import { type FunctionContext, defineFunction } from "@zsys/functions";
import { z } from "@zsys/schema";

type EmptyContext = FunctionContext;
declare const emptyContext: EmptyContext;

// @ts-expect-error undeclared function clients are not available
emptyContext.functions.missing;
// @ts-expect-error undeclared job clients are not available
emptyContext.jobs.missing;
// @ts-expect-error undeclared event clients are not available
emptyContext.events.missing;
// @ts-expect-error undeclared bucket clients are not available
emptyContext.buckets.missing;
// @ts-expect-error undeclared cache clients are not available
emptyContext.cache.missing;
// @ts-expect-error undeclared agent clients are not available
emptyContext.agents.missing;

const output = z.object({ ok: z.literal(true) });
const input = z.object({});

defineFunction({
  id: "types.context",
  input,
  output,
  handler: (_value, context) => {
    const invocationId: string = context.invocation.id;
    const source: "direct" | "http" | "job" | "event" | "tool" | "agent" =
      context.invocation.source;
    const signal: AbortSignal = context.signal;
    const environment = context.env;
    const now: Date = context.time.now();
    const delayed: Promise<void> = context.time.sleep(1);
    const logged: void = context.log.info("ready", { invocationId, source });

    void signal;
    void environment;
    void now;
    void delayed;
    return { ok: true as const };
  },
});

const effectResult = null as unknown as Effect.Effect<{ readonly ok: true }, never, never>;

defineFunction({
  id: "types.effect-return",
  input,
  output,
  // @ts-expect-error public handlers return plain values or Promises, never Effect values
  handler: () => effectResult,
});
