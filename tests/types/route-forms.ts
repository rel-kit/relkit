/** `defineRoute` is one signature for its two forms; `target` or `handler` selects the form. */
import { defineFunction } from "relkit/functions";
import {
  defineRoute,
  type FunctionRouteDescriptor,
  type RawHttpHandler,
  type RawRouteDescriptor,
} from "relkit/routes";
import { z } from "relkit/schema";

const getOrder = defineFunction({
  id: "types.route-forms.get-order",
  input: z.object({ orderId: z.string() }),
  output: z.object({ orderId: z.string(), totalCents: z.number() }),
  handler: async ({ orderId }) => ({ orderId, totalCents: 1 }),
});

// A function route: its descriptor carries the target, and `response` reads the target's output.
const functionRoute = defineRoute({
  target: getOrder,
  successStatus: 200,
  response: (order) => ({ headers: { "x-total": String(order.totalCents) } }),
});
const asFunctionRoute: FunctionRouteDescriptor<string, typeof getOrder, undefined> = functionRoute;
const routeTarget: typeof getOrder = functionRoute.target;
// @ts-expect-error a function route has no raw handler
functionRoute.handler;
void [asFunctionRoute, routeTarget];

// A raw route: its descriptor carries the handler.
const rawRoute = defineRoute({ handler: () => new Response("ok") });
const asRawRoute: RawRouteDescriptor<string, RawHttpHandler> = rawRoute;
const isRaw: true = rawRoute.raw;
// @ts-expect-error a raw route has no target
rawRoute.target;
void [asRawRoute, isRaw];

// A raw handler's parameter is the request, without an annotation.
defineRoute({
  handler: async (request) => {
    const method: string = request.method;
    // @ts-expect-error the parameter is a Request, not any
    request.missing;
    return new Response(method);
  },
});

// @ts-expect-error a route needs a target or a handler
defineRoute({ id: "types.route-forms.empty" });

defineRoute({
  target: getOrder,
  // @ts-expect-error a route has a target or a handler, not both
  handler: () => new Response("ok"),
});

defineRoute({
  handler: () => new Response("ok"),
  // @ts-expect-error options of a function route do not apply to a raw handler
  successStatus: 201,
});

defineRoute({
  target: getOrder,
  // @ts-expect-error a status is a number
  successStatus: "200",
});

defineRoute({
  target: getOrder,
  // @ts-expect-error the response mapping reads the target's output
  response: (order) => ({ headers: { "x-missing": order.missing } }),
});
