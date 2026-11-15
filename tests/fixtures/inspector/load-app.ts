/** A generated API project with a declared conflict and a function dependency, and a mixed request plan. */
import type { GeneratedAppOptions } from "./generated-app.js";

/** Extra files: `POST /items` answers 201, 409 (declared) or 422, and calls a lookup function. */
export const LOAD_APP: GeneratedAppOptions = {
  template: "api",
  files: {
    "src/services/items/errors/item-exists.error.ts": `import { defineError } from "relkit/functions";
import { z } from "zod";

export default defineError({
  id: "items.exists",
  data: z.object({ name: z.string() }),
  message: ({ name }) => \`Item \${name} already exists\`,
  http: { status: 409 },
});
`,
    "src/services/items/functions/lookup-item.function.ts": `import { defineFunction } from "relkit/functions";
import { z } from "zod";

const lookupItem = defineFunction({
  input: z.object({ name: z.string() }),
  output: z.object({ exists: z.boolean() }),
  handler: async ({ name }) => {
    await new Promise((resolve) => setTimeout(resolve, 1));
    return { exists: name.startsWith("dup") };
  },
});

export default lookupItem;
`,
    "src/services/items/functions/create-item.function.ts": `import { defineFunction, fail } from "relkit/functions";
import { z } from "zod";
import ItemExists from "@app/services/items/errors/item-exists.error.js";
import lookupItem from "@app/services/items/functions/lookup-item.function.js";

const createItem = defineFunction({
  input: z.object({ name: z.string().min(1) }),
  output: z.object({ name: z.string() }),
  errors: [ItemExists],
  dependencies: { functions: { lookupItem } },
  handler: async ({ name }, context) => {
    const { exists } = await context.functions.lookupItem({ name });
    if (exists) return fail(ItemExists, { name });
    context.log.info("item created", { name });
    return { name };
  },
});

export default createItem;
`,
    "src/services/items/service.ts": `import { defineService } from "relkit/services";
import createItem from "@app/services/items/functions/create-item.function.js";
import lookupItem from "@app/services/items/functions/lookup-item.function.js";

export default defineService({ functions: { createItem, lookupItem } });
`,
    "src/routes/items/route.ts": `import { defineServiceRoutes } from "relkit/routes";
import items from "@app/services/items/service.js";

export default defineServiceRoutes(items, {
  POST: { member: "createItem", successStatus: 201 },
});
`,
  },
};

/** One planned request and the status the application must answer. */
export interface LoadRequest {
  readonly kind: string;
  readonly method: string;
  readonly path: string;
  readonly body?: string;
  readonly status: number;
}

const json = (value: unknown) => JSON.stringify(value);

/** The mix, in the order one cycle sends it; each kind is one row. */
export const LOAD_KINDS: readonly LoadRequest[] = [
  { kind: "hello-200", method: "GET", path: "/hello?name=load", status: 200 },
  { kind: "unmatched-404", method: "GET", path: "/no-such-route", status: 404 },
  { kind: "item-201", method: "POST", path: "/items", body: json({ name: "fresh" }), status: 201 },
  { kind: "item-409", method: "POST", path: "/items", body: json({ name: "dup" }), status: 409 },
  { kind: "item-422", method: "POST", path: "/items", body: json({ name: "" }), status: 422 },
  {
    kind: "order-201",
    method: "POST",
    path: "/orders",
    body: json({ orderId: "o-1", sku: "sku-1", quantity: 2 }),
    status: 201,
  },
  { kind: "method-405", method: "DELETE", path: "/hello", status: 405 },
];

/** Sends one planned request and returns its answer's status and request id. */
export async function sendLoadRequest(origin: string, request: LoadRequest) {
  const response = await fetch(`${origin}${request.path}`, {
    method: request.method,
    ...(request.body === undefined
      ? {}
      : { body: request.body, headers: { "content-type": "application/json" } }),
  });
  await response.arrayBuffer();
  return { status: response.status, requestId: response.headers.get("x-request-id") ?? undefined };
}
