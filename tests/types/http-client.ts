import { oc } from "@orpc/contract";
import { createClient } from "@zsys/client";
import { z } from "@zsys/schema";

const contract = {
  ordersGet: oc
    .input(z.object({ note: z.string(), orderId: z.string() }))
    .output(z.object({ orderId: z.string(), totalCents: z.number() })),
} as const;

const headers = new Headers();
const client = createClient<typeof contract>({ baseUrl: "https://example.test", headers });
const output: Promise<{ orderId: string; totalCents: number }> = client.ordersGet({
  note: "gift",
  orderId: "order-1",
});

headers.set("authorization", "Bearer current");
headers.delete("authorization");

createClient<typeof contract>({
  baseUrl: "https://example.test",
  credentials: "same-origin",
  headers: async () => ({ authorization: "Bearer future" }),
});

// @ts-expect-error required input is preserved from the contract
void client.ordersGet({ orderId: "order-1" });
// @ts-expect-error successful output is returned directly
const legacy: Promise<{ status: number; data: unknown }> = output;
void legacy;
