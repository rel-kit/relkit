/** Supplies native receiver-owned event and nested publication descriptors for actual paired source compilation. */
export const commerceEventSources = {
  "examples/commerce/src/services/orders/events/layout-created.event.ts": `/** Declares the native event contract consumed by a different service. */
import { defineEvent } from "@relkit/app/events";
import { z } from "@relkit/app/schema";
export default defineEvent({ id: "orders.layout-created", input: z.object({ orderId: z.string().min(1) }) });
`,
  "examples/commerce/src/services/orders/functions/layout-publish.function.ts": `/** Publishes only its compiler-declared event through the native generated context. */
import { defineFunction } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";
export default defineFunction({ id: "orders.layout-publish", input: z.object({ orderId: z.string().min(1) }), output: z.void(), publishes: ["orders.layout-created"],
  handler: async (input, context) => { await context.events["orders.layout-created"].publish(input); return undefined; },
});
`,
  "examples/commerce/src/services/orders/functions/layout-nested.function.ts": `/** Invokes the original native publisher while retaining nested invocation authority. */
import { defineFunction } from "@relkit/app/functions";
import publisher from "./layout-publish.function.js";
export default defineFunction({ id: "orders.layout-nested", input: publisher.input, output: publisher.output,
  handler: (input) => publisher.invoke(input),
});
`,
  "examples/commerce/src/services/receipts/functions/layout-delivery.function.ts": `/** Keeps delivery ownership with the receiver instead of the event publisher. */
import { defineEventFunction } from "@relkit/app/events";
export default defineEventFunction({ id: "receipts.layout-delivery", event: "orders.layout-created", concurrency: 2, timeoutMs: 3000,
  handler: (input, context) => { context.log.info("layout.delivery", { orderId: input.orderId }); },
});
`,
} as const;
