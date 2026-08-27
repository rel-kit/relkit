import { defineFunction } from "@relkit/functions";
import { z } from "@relkit/schema";

const handler = defineFunction({
  id: "types.http-handler-boundary",
  input: z.object({ orderId: z.string() }),
  output: z.object({ ok: z.literal(true) }),
  handler: (_input, context) => {
    const signal: AbortSignal = context.signal;
    const now: Date = context.time.now();
    // @ts-expect-error public handlers receive no Hono request context
    context.req;
    // @ts-expect-error public handlers receive no Hono response context
    context.res;
    void signal;
    void now;
    return { ok: true as const };
  },
});

void handler;
