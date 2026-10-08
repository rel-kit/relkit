import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { z } from "@relkit/app/schema";
import { defineFunction } from "@relkit/app/functions";
import { defineService } from "@relkit/app/services";
import { defineServiceRoutes } from "@relkit/app/routes";
import { invokeFunction } from "@relkit/testing";
import { defineEvent, defineEventFunction } from "@relkit/app/events";
import { defineJob } from "@relkit/app/jobs";
import { defineTask } from "@relkit/app/tasks";
import ts from "typescript";

async function evaluateSnippet(name: string, bindings: Record<string, unknown>) {
  const source = await readFile(resolve("components/landing/snippets", `${name}.txt`), "utf8");
  const parsed = ts.createSourceFile(`${name}.tsx`, source, ts.ScriptTarget.ESNext);
  // Resolve app imports through the explicit dependencies supplied by each test.
  const isolated = parsed.statements
    .filter((statement) => !ts.isImportDeclaration(statement))
    .map((statement) => statement.getFullText(parsed))
    .join("\n");
  const { outputText } = ts.transpileModule(isolated, {
    fileName: `${name}.tsx`,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ESNext,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  // Only evaluate repository-owned examples, with explicit dependencies.
  return new Function(
    "exports",
    "require",
    ...Object.keys(bindings),
    `${outputText}; return exports;`,
  )({}, createRequire(import.meta.url), ...Object.values(bindings));
}

test("database excerpt returns exactly the declared output fields", async () => {
  const { default: definition } = await evaluateSnippet("database-usage", {
    z,
    defineFunction: (options: unknown) => options,
  });
  const result = await definition.handler(
    {},
    {
      database: {
        orders: {
          findMany: async () => [{ orderId: "order-1", totalCents: 2_000, private: "hidden" }],
        },
      },
    },
  );
  expect(result).toEqual([{ orderId: "order-1", totalCents: 2_000 }]);
  expect(definition.output.parse(result)).toEqual(result);
});

test("realtime excerpt appends chat messages without refetching", async () => {
  type Message = { id: string; sender: string; text: string };
  let displayed: Message[] = [];
  let channel = "";
  let roomId = "";
  let onMessage: (event: Message) => void = () => {};
  const { OrderChat } = await evaluateSnippet("realtime-fe", {
    useState: () => [
      [],
      (update: (items: Message[]) => Message[]) => {
        displayed = update(displayed);
      },
    ],
    useChannel: (
      name: string,
      options: { params: { roomId: string }; on: { message: typeof onMessage } },
    ) => {
      channel = name;
      roomId = options.params.roomId;
      onMessage = options.on.message;
      return { status: "connected" };
    },
  });
  OrderChat();
  const support = { id: "message-1", sender: "Support", text: "Your order has shipped." };
  const customer = { id: "message-2", sender: "Customer", text: "Thank you!" };
  onMessage(support);
  onMessage(customer);
  expect(channel).toBe("chat.messages");
  expect(roomId).toBe("order-1");
  expect(displayed).toEqual([support, customer]);
});

test("service excerpt exposes its members through real service routes", async () => {
  const operation = () =>
    defineFunction({
      input: z.object({}),
      output: z.object({}),
      handler: async () => ({}),
    });
  const getOrder = operation();
  const searchOrders = operation();
  const createOrder = operation();
  const { default: orders } = await evaluateSnippet("service-be", {
    defineService,
    getOrder,
    searchOrders,
    createOrder,
  });
  const { GET, POST } = await evaluateSnippet("service-routes", {
    defineServiceRoutes,
    orders,
  });
  expect(GET.target).toBe(searchOrders);
  expect(GET.client.operation).toBe("query");
  expect(POST.target).toBe(createOrder);
  expect(POST.successStatus).toBe(201);
});

test("order creation excerpt validates quantity and returns a price in cents", async () => {
  const { default: definition } = await evaluateSnippet("function-be", {
    z,
    defineFunction: (options: unknown) => options,
  });
  const input = { orderId: "order-1", sku: "shirt", quantity: 2 };
  const result = await definition.handler(definition.input.parse(input));
  expect(result).toEqual({ orderId: "order-1", totalCents: 2_000 });
  expect(definition.output.parse(result)).toEqual(result);
  expect(() => definition.input.parse({ ...input, quantity: 0 })).toThrow();
  expect(definition.onBefore({ ...input, sku: " shirt " }).sku).toBe("shirt");
});

test("order events connect a schema-valid publication to a durable subscriber", async () => {
  const { default: event, orderConfirmation } = await evaluateSnippet("event-be", {
    z,
    defineEvent,
    defineEventFunction,
  });
  const { default: publisher } = await evaluateSnippet("event-usage", {
    z,
    defineFunction: (options: unknown) => options,
  });
  const deliveries: unknown[] = [];
  const logs: unknown[] = [];
  const result = await publisher.handler(
    { orderId: "order-1", quantity: 2 },
    {
      events: {
        [event.id]: {
          publish: async (payload: unknown) => {
            const validated = event.input.parse(payload);
            deliveries.push(validated);
            await orderConfirmation.handler(validated, {
              log: { info: (...args: unknown[]) => logs.push(args) },
            });
          },
        },
      },
    },
  );
  expect(orderConfirmation.event).toBe(event.id);
  expect(orderConfirmation.delivery).toBe("durable");
  expect(deliveries).toEqual([publisher.output.parse(result)]);
  expect(logs).toEqual([["Order confirmation requested", { orderId: "order-1" }]]);
});

test("scheduled export uses the current job API and valid task input", async () => {
  const exportOrders = defineTask({
    id: "orders.export-orders",
    version: "1",
    execution: "durable",
    input: z.object({ orderIds: z.array(z.string()) }),
    output: z.object({ csv: z.string(), exported: z.number() }),
    progress: z.object({ completed: z.number(), total: z.number() }),
    handler: ({ orderIds }) => ({ csv: orderIds.join(","), exported: orderIds.length }),
  });
  const { default: job } = await evaluateSnippet("background-job-be", { defineJob, exportOrders });
  const schedule = job.schedules[0];
  expect(job.task).toBe(exportOrders);
  expect(exportOrders.input.parse(schedule.input)).toEqual({ orderIds: ["order-1"] });
  expect(schedule.cron).toBe("0 0 * * *");
  expect(schedule.timezone).toBe("UTC");
});

test("checkout invokes order hooks through the shared runtime", async () => {
  const logs: unknown[] = [];
  const { default: createOrder } = await evaluateSnippet("function-be", { z, defineFunction });
  const { default: checkout } = await evaluateSnippet("function-usage", {
    z,
    defineFunction,
    createOrder,
  });
  const result = await invokeFunction(
    checkout,
    {
      orderId: "order-1",
      sku: " shirt ",
      quantity: 2,
    },
    {
      context: (options) => ({
        ...options,
        log: { info: (...args: unknown[]) => logs.push(args) },
      }),
    },
  );
  expect(result).toEqual({ orderId: "order-1", totalCents: 2_000 });
  expect(logs).toEqual([["Order created", result]]);
  await expect(
    invokeFunction(checkout, {
      orderId: "order-1",
      sku: "shirt",
      quantity: 0,
    }),
  ).rejects.toThrow();
});
