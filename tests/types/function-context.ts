import { Effect } from "effect";
import { type FunctionContext, defineError, defineFunction, fail } from "@zsys/functions";
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
  handler: (_value, _request, context) => {
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

const expectedFailure = defineError({
  id: "types.context-failure",
  data: z.object({ reason: z.string() }),
  message: ({ reason }) => reason,
  retry: "never",
});

const effectResult = null as unknown as Effect.Effect<
  { readonly ok: true },
  ReturnType<typeof expectedFailure.create>,
  never
>;

defineFunction({
  id: "types.effect-return",
  input,
  output,
  errors: [expectedFailure],
  handler: () => effectResult,
});

defineFunction({
  id: "types.missing-declared-error",
  input,
  output,
  errors: [expectedFailure],
  // @ts-expect-error every error listed in errors must be returned by the handler
  handler: () => ({ ok: true as const }),
});

defineFunction({
  id: "types.plain-failure",
  input,
  output,
  errors: [expectedFailure],
  handler: () => fail(expectedFailure, { reason: "expected" }),
});

defineFunction({
  id: "types.effect-failure",
  input,
  output,
  errors: [expectedFailure],
  handler: () => Effect.fail(expectedFailure.create({ reason: "expected" })),
});

const alternateFailure = defineError({
  id: "types.context-alternate-failure",
  data: z.object({ code: z.number() }),
  message: ({ code }) => `failure ${code}`,
  retry: "never",
});

defineFunction({
  id: "types.union-failures",
  input,
  output,
  errors: [expectedFailure, alternateFailure],
  handler: async () =>
    Math.random() > 0.5
      ? fail(expectedFailure, { reason: "expected" })
      : Effect.fail(alternateFailure.create({ code: 500 })),
});

const undeclaredFailure = defineError({
  id: "types.context-undeclared",
  data: z.object({}),
  message: "undeclared",
  retry: "never",
});

defineFunction({
  id: "types.undeclared-plain-failure",
  input,
  output,
  // @ts-expect-error add the returned error to the function errors list
  handler: () => {
    return fail(undeclaredFailure, {});
  },
});

defineFunction({
  id: "types.undeclared-effect-failure",
  input,
  output,
  // @ts-expect-error add the Effect error to the function errors list
  handler: () => {
    return Effect.fail(undeclaredFailure.create({}));
  },
});
