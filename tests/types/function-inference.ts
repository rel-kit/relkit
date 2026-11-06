import type {
  FunctionContext,
  FunctionDependencies,
  FunctionHandlerValidation,
} from "relkit/functions";
import { Effect } from "effect";
import { defineError, defineFunction, defineFunctionEffect } from "relkit/functions";
import { defineBucket } from "relkit/buckets";
import { defineCache } from "relkit/cache";
import { defineEvent } from "relkit/events";
import { defineJob, defineTask } from "relkit/jobs";
import { z, type InferInput, type InferOutput } from "relkit/schema";
import { defineTool } from "relkit/tools";

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
const constructedNotFound: ReturnType<typeof notFound.create> = new notFound({
  orderId: "missing",
});
void constructedNotFound;
type LookupHandlerResult = Promise<
  ReturnType<typeof notFound.create> | InferOutput<typeof lookupOutput>
>;
const lookupValidation: FunctionHandlerValidation<
  LookupHandlerResult,
  InferOutput<typeof lookupOutput>,
  [typeof notFound]
> = {};
void lookupValidation;

const lookup = defineFunction({
  id: "types.inference-lookup",
  input: transformedInput,
  output: lookupOutput,
  errors: [notFound],
  handler: async (input) =>
    input.orderId === "missing"
      ? new notFound({ orderId: input.orderId })
      : { orderId: input.orderId, totalCents: 100 },
});

declare const lookupContext: FunctionContext<{ functions: { lookup: typeof lookup } }>;
const detachedLookup: (
  input: InferInput<typeof transformedInput>,
) => Promise<InferOutput<typeof lookup.output>> = lookupContext.functions.lookup;
const detachedLookupResult = detachedLookup({ rawId: "order-1" });
void detachedLookupResult;

const lookupEffect = defineFunctionEffect({
  id: "types.inference-effect-lookup",
  input: transformedInput,
  output: lookupOutput,
  errors: [notFound],
  handler: (input) =>
    input.orderId === "missing"
      ? new notFound({ orderId: input.orderId })
      : { orderId: input.orderId, totalCents: 100 },
});
const effectLookup = Effect.runSync(lookupEffect);
const effectLookupId: "types.inference-effect-lookup" = effectLookup.id;
declare const effectContext: FunctionContext<{ functions: { effectLookup: typeof effectLookup } }>;
const effectLookupResult: Promise<InferOutput<typeof lookupOutput>> =
  effectContext.functions.effectLookup({ rawId: "order-1" });
const effectLookupErrorId: "types.inference-not-found" | undefined = effectLookup.errors?.[0]?.id;
void effectLookupId;
void effectLookupResult;
void effectLookupErrorId;
// @ts-expect-error the Effect descriptor accepts rawId, not the transformed orderId
effectContext.functions.effectLookup({ orderId: "order-1" });

defineFunctionEffect({
  id: "types.inference-effect-invalid-output",
  input: transformedInput,
  output: lookupOutput,
  // @ts-expect-error the handler result must match the declared output schema
  handler: () => ({ orderId: "order-1", totalCents: "invalid" }),
});

const jobInput = z.object({ rawId: z.string() });
const sendReceiptTask = defineTask({
  id: "types.inference-task",
  version: "1",
  input: jobInput,
  output: z.object({ sent: z.boolean() }),
  handler: async () => ({ sent: true }),
});
const sendReceipt = defineJob({
  id: "types.inference-job",
  name: "sendReceipt",
  task: sendReceiptTask,
});
export const orderCreated = defineEvent({
  id: "types.inference-event",
  version: 1,
  input: z.object({ orderId: z.string() }),
});
const receiptBucket = defineBucket({ id: "types.inference-bucket", visibility: "private" });
const prices = defineCache({
  id: "types.inference-cache",
  key: z.object({ sku: z.string() }),
  value: z.number(),
});

const dependencies = {
  functions: { lookup },
  events: { orderCreated },
  jobs: { sendReceipt },
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
    await context.jobs.sendReceipt.trigger({ rawId: input.orderId });
    // @ts-expect-error job clients trigger task runs; there is no enqueue
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

void createOrder;

const createOrderEffect = defineFunctionEffect({
  id: "types.inference-effect-parent",
  input: z.object({ orderId: z.string() }),
  output: z.object({ totalCents: z.number() }),
  dependencies,
  handler: async ({ orderId }, context) => {
    const price: number | undefined = await context.cache.prices.get({ sku: orderId });
    return { totalCents: price ?? 0 };
  },
});
const effectParent = Effect.runSync(createOrderEffect);
const effectParentId: "types.inference-effect-parent" = effectParent.id;
void effectParentId;

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

const inferredFunctionTool = lookup.asTool({
  description: "Look up an order",
  sideEffect: "read",
  approval: "never",
});
const inferredFunctionToolId: "types.inference-lookup.tool" = inferredFunctionTool.id;
const functionToolContract: import("relkit/tools").ToolDescriptor<string> = inferredFunctionTool;
void inferredFunctionToolId;
void functionToolContract;

const metadataFunction = defineFunction({
  id: "types.metadata-function",
  input: z.object({ id: z.string() }),
  output: lookupOutput,
  tool: { description: "Read metadata", sideEffect: "read", approval: "never" },
  handler: async () => ({ orderId: "order-1", totalCents: 100 }),
});
const metadataTool = metadataFunction.asTool();
const metadataToolId: "types.metadata-function.tool" = metadataTool.id;
void metadataToolId;

// @ts-expect-error zero-argument asTool requires complete function tool metadata
lookup.asTool();

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
// @ts-expect-error a function not declared on the function is unavailable
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
          // @ts-expect-error a function dependency must reference a function
          kind: "task",
          id: "types.inference-cache",
        },
        input: z.object({}),
        output: z.object({}),
      },
    },
  },
  handler: () => ({}),
});

// A handler may throw a declared error instead of returning it.
const thrownLookup = defineFunction({
  id: "types.inference-thrown-lookup",
  input: transformedInput,
  output: lookupOutput,
  errors: [notFound],
  handler: async (input) => {
    if (input.orderId === "missing") throw new notFound({ orderId: input.orderId });
    return { orderId: input.orderId, totalCents: 100 };
  },
});
void thrownLookup;

// Declaring an error the handler never raises is not a type error.
const unusedErrorLookup = defineFunction({
  id: "types.inference-unused-error",
  input: transformedInput,
  output: lookupOutput,
  errors: [notFound],
  handler: async (input) => ({ orderId: input.orderId, totalCents: 100 }),
});
void unusedErrorLookup;
const unusedValidation: FunctionHandlerValidation<
  Promise<InferOutput<typeof lookupOutput>>,
  InferOutput<typeof lookupOutput>,
  [typeof notFound]
> = {};
void unusedValidation;

const otherError = defineError({
  id: "types.inference-other",
  data: z.object({}),
  message: "Other",
});
defineFunction({
  id: "types.inference-undeclared-error",
  input: transformedInput,
  output: lookupOutput,
  errors: [notFound],
  // @ts-expect-error a returned error must be one of the declared errors
  handler: async () => new otherError({}),
});
