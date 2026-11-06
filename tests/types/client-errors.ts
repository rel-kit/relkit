import {
  api,
  createApi,
  type ApiRoute,
  type ClientRouteContract,
  type RelkitDeclaredError,
  type RelkitUndeclaredError,
  type RouteError,
} from "@relkit/client";
import { useRoute, useRouteMutation } from "@relkit/client/react";

declare function expectType<Value>(value: Value): void;

type PriceErrors =
  | RelkitDeclaredError<"shop.not-found", 404, { readonly orderId: string }>
  | RelkitDeclaredError<"shop.payment-declined", 402, { readonly reason: string }>
  | RelkitUndeclaredError;

declare module "@relkit/client" {
  interface ClientApi {
    readonly shop: {
      readonly priceOrder: ApiRoute<
        ClientRouteContract<{ orderId: string }, { totalCents: number }, PriceErrors> & {
          readonly operation: "mutation";
        }
      >;
      readonly getOrder: ApiRoute<
        ClientRouteContract<
          { orderId: string },
          { totalCents: number },
          | RelkitDeclaredError<"shop.not-found", 404, { readonly orderId: string }>
          | RelkitUndeclaredError
        > & { readonly operation: "query" }
      >;
    };
  }
}

/** Narrowing on `code` selects the declared error's `status` and `data`. */
function describe(error: RouteError<typeof api.shop.priceOrder>): string {
  if (error.code === "shop.payment-declined") {
    expectType<402>(error.status);
    expectType<string>(error.data.reason);
    // @ts-expect-error the payment error carries no orderId
    error.data.orderId;
    return error.data.reason;
  }
  if (error.code === "shop.not-found") {
    expectType<404>(error.status);
    return error.data.orderId;
  }
  expectType<RelkitUndeclaredError>(error);
  // @ts-expect-error codes outside the declared and framework sets are rejected
  if (error.code === "shop.unknown") return "";
  return error.code;
}
void describe;

const order = useRoute(api.shop.getOrder, { input: { orderId: "o1" } });
if (order.error?.code === "shop.not-found") expectType<string>(order.error.data.orderId);
// @ts-expect-error route input is checked
useRoute(api.shop.getOrder, { input: { id: "o1" } });
// @ts-expect-error mutation routes are excluded from query hooks
useRoute(api.shop.priceOrder, { input: { orderId: "o1" } });

const price = useRouteMutation(api.shop.priceOrder);
price.mutate({ orderId: "o1" });
if (price.error?.code === "shop.payment-declined") expectType<string>(price.error.data.reason);
if (price.error?.code === "WRITE_NOT_SENT") expectType<0>(price.error.status);
// @ts-expect-error query routes are excluded from mutation hooks
useRouteMutation(api.shop.getOrder);

const backend = createApi({ baseUrl: "http://127.0.0.1:3000" });
const priced: Promise<{ totalCents: number }> = backend.shop.priceOrder({ orderId: "o1" });
void priced;
useRoute(backend.shop.getOrder, { input: { orderId: "o1" } });
