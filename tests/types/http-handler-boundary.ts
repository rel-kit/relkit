import { defineFunction } from "@zsys/functions";
import { z } from "@zsys/schema";

const handler = defineFunction({
  id: "types.http-handler-boundary",
  input: z.object({ orderId: z.string() }),
  output: z.object({ ok: z.literal(true) }),
  handler: (_input, request, context) => {
    const signal: AbortSignal = context.signal;
    const now: Date = context.time.now();
    const url: string | undefined = request?.url;
    // @ts-expect-error public handlers receive no Hono request context
    context.req;
    // @ts-expect-error public handlers receive no Hono response context
    context.res;
    void signal;
    void now;
    void url;
    return { ok: true as const };
  },
});

void handler;
