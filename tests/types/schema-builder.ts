/** The built-in builder is `s`; `z` is the same builder until the breaking release renames it. */
import { defineFunction } from "relkit/functions";
import { s, z, type InferInput, type InferOutput } from "relkit/schema";

/** Mutual assignability; the builder returns mapped types that strict identity does not match. */
type Equal<Left, Right> = [Left] extends [Right] ? ([Right] extends [Left] ? true : false) : false;
const expectType = <T extends true>(): T => true as T;

const order = s.object({
  sku: s.string().min(1),
  quantity: s.number().int().positive(),
  note: s.string().optional(),
  tags: s.array(s.string()),
});

expectType<
  Equal<InferOutput<typeof order>, { sku: string; quantity: number; note?: string; tags: string[] }>
>();
expectType<Equal<InferInput<typeof order>, InferOutput<typeof order>>>();

const parsed = s.object({ raw: s.string() }).transform(({ raw }) => ({ length: raw.length }));
expectType<Equal<InferInput<typeof parsed>, { raw: string }>>();
expectType<Equal<InferOutput<typeof parsed>, { length: number }>>();

// `z` is the same value, so existing code keeps compiling.
const same: typeof s = z;
void same;

const placeOrder = defineFunction({
  id: "types.place-order",
  input: order,
  output: s.object({ orderId: s.string() }),
  handler: async (input) => {
    expectType<Equal<typeof input.quantity, number>>();
    return { orderId: input.sku };
  },
});
void placeOrder;

// @ts-expect-error s.string() rejects a number output.
s.string().parse satisfies (value: unknown) => number;
