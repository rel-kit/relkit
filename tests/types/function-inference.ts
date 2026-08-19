import type { FunctionClientFor, FunctionContext, FunctionDependencies } from "@zsys/functions";
import { defineError, defineFunction } from "@zsys/functions";
import { defineBucket } from "@zsys/buckets";
import { defineCache } from "@zsys/cache";
import { defineEvent } from "@zsys/events";
import { defineJob } from "@zsys/jobs";
import { z, type InferInput, type InferOutput } from "@zsys/schema";
import { defineTool } from "@zsys/tools";

const transformedInput = z
  .object({ rawId: z.string() })
  .transform(({ rawId }) => ({ orderId: rawId }));
const lookupOutput = z.object({ orderId: z.string(), totalCents: z.number() });
const notFound = defineError({
  id: "types.inference-not-found",
  data: z.object({ orderId: z.string() }),
  message: ({ orderId }) => "Missing " + orderId,
  retry: "never",
});

const lookup = defineFunction({
  id: "types.inference-lookup",
  input: transformedInput,
  output: lookupOutput,
  errors: [notFound],
  handler: async (input) => ({ orderId: input.orderId, totalCents: 100 }),
});

const jobInput = z.object({ rawId: z.string() });
const sendReceipt = defineJob({
  id: "types.inference-job",
  input: jobInput,
  target: lookup,
  retry: { maxAttempts: 1, initialDelayMs: 0, maxDelayMs: 0, multiplier: 1, jitter: "none" },
});
const orderCreated = defineEvent({
  id: "types.inference-event",
  version: 1,
  payload: z.object({ orderId: z.string() }),
});
const receiptBucket = defineBucket({ id: "types.inference-bucket", visibility: "private" });
const prices = defineCache({
  id: "types.inference-cache",
  key: z.object({ sku: z.string() }),
  value: z.number(),
});

const dependencies = {
  functions: { lookup },
  jobs: { sendReceipt },
  events: { orderCreated },
  buckets: { receiptBucket },
  cache: { prices },
} satisfies FunctionDependencies;

const createOrder = defineFunction({
  id: "types.inference-parent",
  input: z.object({ orderId: z.string(), sku: z.string() }),
  output: z.object({ totalCents: z.number() }),
  dependencies,
  handler: async (input, context) => {
    const lookupResult: InferOutput<typeof lookup.output> = await context.functions.lookup({
      rawId: input.orderId,
    });
    const price: number | undefined = await context.cache.prices.get({ sku: input.sku });
    const produced = await context.cache.prices.getOrSet({ sku: input.sku }, () => 100);
    await context.cache.prices.set({ sku: input.sku }, produced);
    await context.events.orderCreated.publish({ orderId: input.orderId });
    await context.jobs.sendReceipt.enqueue({ rawId: input.orderId });
    await context.buckets.receiptBucket.put("orders/1.json", new Uint8Array());
    const names: readonly string[] = await context.buckets.receiptBucket.list();

    const inputValue: InferInput<typeof transformedInput> = { rawId: input.orderId };
    const outputValue: InferOutput<typeof lookup.output> = lookupResult;
    void price;
    void names;
    void inputValue;
    void outputValue;
    return { totalCents: produced };
  },
});

const lookupClient: FunctionClientFor<typeof lookup> = async ({ rawId }) => ({
  orderId: rawId,
  totalCents: 100,
});
void lookupClient;
void createOrder;

const tool = defineTool({
  id: "types.inference-tool",
  target: lookup,
  description: "Look up an order",
  sideEffect: "read",
  approval: "never",
});
const toolInput: InferInput<typeof tool.target.input> = { rawId: "order-1" };
const toolOutput: InferOutput<typeof tool.target.output> = { orderId: "order-1", totalCents: 100 };
const toolErrorId: "types.inference-not-found" = tool.target.errors![0]!.id;
void toolInput;
void toolOutput;
void toolErrorId;

type NarrowedContext = FunctionContext<typeof dependencies>;
declare const narrowed: NarrowedContext;
const narrowedResult: Promise<InferOutput<typeof lookup.output>> = narrowed.functions.lookup({
  rawId: "order-1",
});
void narrowedResult;

// @ts-expect-error transformed function input accepts rawId, not the output property orderId
narrowed.functions.lookup({ orderId: "order-1" });
// @ts-expect-error a function's output is validated and cannot be treated as an arbitrary string
const invalidOutput: Promise<string> = narrowed.functions.lookup({ rawId: "order-1" });
void invalidOutput;
// @ts-expect-error undeclared names are absent from the narrowed dependency map
narrowed.functions.missing;
// @ts-expect-error the job client is named by the dependency map
narrowed.jobs.missing;
// @ts-expect-error a bucket not declared on the function is unavailable
narrowed.buckets.other;

defineFunction({
  id: "types.inference-invalid-ref",
  input: z.object({}),
  output: z.object({}),
  dependencies: {
    functions: {
      wrong: {
        ref: {
          // @ts-expect-error dependency references must retain their declared descriptor kind
          kind: "cache",
          id: "types.inference-cache",
        },
        input: z.object({}),
        output: z.object({}),
      },
    },
  },
  handler: () => ({}),
});
