import { describe, expect, test } from "bun:test";
import { defineEvent, onEvent } from "../../packages/events/src/index.ts";
import { z } from "../../packages/schema/src/index.ts";
import { NORMALIZE_CODES, normalizeCompilation } from "../../packages/compiler/src/index.ts";
import type { ExtractedDescriptor } from "../../packages/compiler/src/discovery/extract.ts";

const created = defineEvent({
  id: "orders.created",
  version: 1,
  payload: z.object({ orderId: z.string() }),
});

describe("callback event listener compilation", () => {
  test("derives named-export identity and emits one validated internal function", () => {
    const listener = onEvent("orders.created" as never, async (payload) => payload);
    const result = normalizeCompilation({
      extracted: [
        extracted(created, "src/events/order-created.event.ts", "orderCreated"),
        extracted(listener, "src/listeners/send-receipt.ts", "sendReceipt"),
      ],
      projectRoot: "/workspace/app",
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.descriptors.find(({ kind }) => kind === "event-trigger")?.id).toBe(
      "orders.created.sendReceipt",
    );
    expect(result.graph?.nodes).toContainEqual(
      expect.objectContaining({
        kind: "function",
        id: "relkit.event.orders.created.sendReceipt.handler",
        generated: expect.objectContaining({
          generatedBy: "event-listener",
          listenerId: "orders.created.sendReceipt",
        }),
      }),
    );
    expect(result.outputs.manifest).toContain(
      "createEventListenerTarget as __relkit_createEventListenerTarget",
    );
    expect(result.outputs.manifest).toContain(
      '__relkit_createEventListenerTarget(__relkit_module_1["sendReceipt"], [__relkit_module_0["orderCreated"]], "relkit.event.orders.created.sendReceipt.handler")',
    );
    expect(result.outputs.manifest).not.toContain(
      '__relkit_bindDescriptorIdentity(__relkit_module_1["sendReceipt"], "relkit.event.orders.created.sendReceipt.handler");',
    );
  });

  test("requires explicit identity for default exports and rejects duplicate inferred IDs", () => {
    const listener = onEvent("orders.created" as never, async () => undefined);
    const defaultResult = normalizeCompilation({
      extracted: [
        extracted(created, "src/events/order-created.event.ts", "orderCreated"),
        extracted(listener, "src/listeners/default.ts", "default", "default"),
      ],
    });
    expect(defaultResult.diagnostics).toContainEqual(
      expect.objectContaining({ code: NORMALIZE_CODES.eventListenerId }),
    );

    const duplicateResult = normalizeCompilation({
      extracted: [
        extracted(created, "src/events/order-created.event.ts", "orderCreated"),
        extracted(listener, "src/listeners/first.ts", "sendReceipt"),
        extracted(listener, "src/listeners/second.ts", "sendReceipt"),
      ],
    });
    expect(duplicateResult.diagnostics).toContainEqual(
      expect.objectContaining({ code: NORMALIZE_CODES.duplicateId }),
    );
  });

  test("rejects stale authored versions as well as unknown names", () => {
    const listener = onEvent("orders.created" as never, async () => undefined, {
      id: "orders.listener",
    });
    const stale = {
      ...listener,
      selector: {
        kind: "single" as const,
        event: { eventId: "orders.created", version: 2 },
      },
    };
    const unknown = {
      ...listener,
      id: "orders.unknown-listener",
      ref: { kind: "event-trigger" as const, id: "orders.unknown-listener" },
      selector: { kind: "single" as const, event: { eventId: "orders.unknown" } },
    };
    const result = normalizeCompilation({ descriptors: [created, stale, unknown] });

    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: NORMALIZE_CODES.eventName,
          message: expect.stringContaining("stale at version 2"),
        }),
        expect.objectContaining({
          code: NORMALIZE_CODES.eventName,
          message: 'Event name "orders.unknown" is not registered.',
        }),
      ]),
    );
  });
});

function extracted(
  descriptor: unknown,
  module: string,
  exportName: string,
  exportKind: "default" | "named" = "named",
): ExtractedDescriptor {
  const value = descriptor as { readonly kind: string; readonly id: string };
  return {
    descriptor: descriptor as ExtractedDescriptor["descriptor"],
    reference: {
      generationId: "event-listener-test",
      descriptorId: value.id,
      kind: value.kind,
      module,
      exportName,
    },
    source: { file: module, line: 1, column: 1 },
    exportName,
    exportKind,
  };
}
