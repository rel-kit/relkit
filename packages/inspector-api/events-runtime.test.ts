import { describe, expect, test } from "bun:test";
import { API_BASE_PATH } from "@relkit/contracts";
import { Hono } from "hono";
import { installInspectorEndpoints } from "./src/index.ts";

describe("inspector event runtime protocol", () => {
  test("projects versioned contracts, trigger bindings, publications, and safe deliveries", async () => {
    const app = new Hono();
    installInspectorEndpoints(app, {
      activeGeneration: {
        generationId: "generation-one",
        graphHash: "sha256:one",
        runtime: {
          events: {
            protocol: "relkit.events.admin",
            version: 1,
            query: async (request: Record<string, unknown>) => {
              expect(request).toMatchObject({
                protocol: "relkit.events.admin",
                version: 1,
                eventId: "orders.created",
                eventVersion: 2,
              });
              return {
                protocol: "relkit.events.admin",
                version: 1,
                events: [
                  {
                    protocol: "relkit.events.admin",
                    protocolVersion: 1,
                    id: "orders.created",
                    version: 2,
                    input: { type: "object", properties: { orderId: { type: "string" } } },
                    source: { file: "src/events.ts", line: 4, column: 1 },
                  },
                ],
                triggers: [
                  {
                    protocol: "relkit.events.admin",
                    version: 1,
                    id: "orders.email",
                    targetFunctionId: "orders.send-email",
                    eventId: "orders.created",
                    eventVersion: 2,
                    delivery: "durable",
                    retry: { maxAttempts: 3 },
                  },
                ],
                capabilities: [
                  {
                    protocol: "relkit.events.admin",
                    version: 1,
                    triggerId: "orders.email",
                    delivery: "durable",
                    restartRecovery: true,
                    atLeastOnce: true,
                    exactlyOnce: false,
                    ordering: "unsupported",
                    orderedByKey: false,
                  },
                ],
                publications: [
                  {
                    eventId: "orders.created",
                    version: 2,
                    instanceId: "event-1",
                    payload: "must-not-cross",
                  },
                ],
                deliveries: [
                  {
                    protocol: "relkit.events.admin",
                    version: 1,
                    deliveryId: "delivery-1",
                    eventInstanceId: "event-1",
                    eventId: "orders.created",
                    version: 2,
                    triggerId: "orders.email",
                    state: "dead-lettered",
                    attempt: 3,
                    failure: { code: "EMAIL_FAILED", message: "safe failure", data: "secret" },
                    handler: "must-not-cross",
                  },
                ],
              };
            },
          },
        },
      },
    });

    const response = await app.request(
      `${API_BASE_PATH}/runtime/events?eventId=orders.created&eventVersion=2&limit=10`,
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      protocol: "relkit.inspector",
      eventProtocol: "relkit.events.admin",
      events: [{ id: "orders.created", version: 2, input: { type: "object" } }],
      triggers: [{ id: "orders.email", eventId: "orders.created", eventVersion: 2 }],
      capabilities: [{ exactlyOnce: false, ordering: "unsupported" }],
      publications: [{ instanceId: "event-1" }],
      deadLetters: [{ deliveryId: "delivery-1", attempt: 3, state: "dead-lettered" }],
    });
    expect(JSON.stringify(body)).not.toContain("must-not-cross");
    expect(JSON.stringify(body)).not.toContain("secret");
    expect(body.publications[0]).not.toHaveProperty("payload");
    expect(body.deadLetters[0]).not.toHaveProperty("failure.data");
  });
});
