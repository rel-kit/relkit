/** Invokes concrete native commerce descriptors without erasing heterogeneous target input/output types. */
import { invokeCommerceTarget as invokeFunction } from "./commerce-native-invocation.js";
import type { HttpInvocationOptions } from "../../../packages/runtime-hono/src/index.ts";
import { runWithRealtimeDispatcher } from "../../../packages/realtime/dist/index.js";
import browsePath from "../../../examples/commerce/src/services/navigation/functions/browse-path.function.ts";
import deleteOrder from "../../../examples/commerce/src/services/orders/functions/delete-order.function.ts";
import getOrder from "../../../examples/commerce/src/services/orders/functions/get-order.function.ts";
import searchOrders from "../../../examples/commerce/src/services/orders/functions/search-orders.function.ts";
import updateOrder from "../../../examples/commerce/src/services/orders/functions/update-order.function.ts";
import uploadAssets from "../../../examples/commerce/src/services/assets/functions/upload-assets.function.ts";
import createOrder from "../../../examples/commerce/src/services/orders/functions/create-order.function.ts";

const dispatcher = {
  trigger: async () => ({
    accepted: true as const,
    eventId: crypto.randomUUID(),
    checkpoint: {
      applicationId: "commerce-http",
      environment: "test",
      channelId: "orders.updated",
      partition: "fixture",
      profile: "default",
      policyEpoch: "test",
      providerEpoch: "test",
      identityScope: "test",
      sessionEpoch: "test",
      sequence: "1",
      historyStart: "1",
      expiresAt: new Date(Date.now() + 300000).toISOString(),
    },
    profile: "default",
    providerProfile: "default",
    providerEpoch: "test",
    duplicate: false,
  }),
  getPresence: async () => ({
    connections: 0,
    status: "fresh" as const,
    revision: "0",
    scope: "process" as const,
  }),
};

/**
 * Keeps each native target's schema and handler inference at its concrete invocation.
 * @param uploadedKeys - Borrowed upload observer.
 * @returns The exact supported function invocation table.
 */
function handlers(uploadedKeys: string[]) {
  return {
    "navigation.browse-path": (request: HttpInvocationOptions) =>
      invokeFunction(browsePath, request.input),
    "orders.delete-order": (request: HttpInvocationOptions) =>
      invokeFunction(deleteOrder, request.input),
    "orders.get-order": (request: HttpInvocationOptions) => invokeFunction(getOrder, request.input),
    "orders.search-orders": (request: HttpInvocationOptions) =>
      invokeFunction(searchOrders, request.input),
    "orders.update-order": (request: HttpInvocationOptions) =>
      invokeFunction(updateOrder, request.input),
    "assets.upload-assets": (request: HttpInvocationOptions) =>
      invokeFunction(uploadAssets, request.input, {
        clients: {
          buckets: {
            assets: {
              put: async (key: string) => {
                uploadedKeys.push(key);
              },
            },
          },
        },
      }),
  };
}

/**
 * Records route invocation while supplying only the explicit native replacements this fixture needs.
 * @param invocations - Borrowed invocation observer.
 * @param uploadedKeys - Borrowed upload observer.
 * @returns Native HTTP engine whose targets retain concrete schema inference.
 */
export function commerceHttpEngine(invocations: HttpInvocationOptions[], uploadedKeys: string[]) {
  const targets = handlers(uploadedKeys);
  return {
    invoke: async (invocation: HttpInvocationOptions) => {
      invocations.push(invocation);
      const entry = Object.entries(targets).find(([id]) => id === invocation.functionId);
      if (entry) return runWithRealtimeDispatcher(dispatcher, () => entry[1](invocation));
      if (invocation.functionId !== "orders.create-order")
        throw new Error(`Unexpected function ${invocation.functionId}`);
      const input = createOrder.input.parse(invocation.input);
      return {
        orderId: input.orderId,
        receiptKey: `${input.orderId}.json`,
        totalCents: input.quantity * 1000,
      };
    },
  };
}
