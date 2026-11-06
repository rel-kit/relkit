/** Verifies that a propagated event continuation links to its producer and writes its receipt. */
import { expect, test } from "bun:test";
import { Effect } from "effect";
import { instrumentationFixture } from "./fixtures/runtime-instrumentation.js";

test("links an event continuation to its producer and writes the receipt", () =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const { receipts, event, eventSpans } = yield* instrumentationFixture;
        const published = yield* Effect.tryPromise(() =>
          event.publish({
            orderId: "order-1",
            receiptKey: "receipts/order-1.json",
          }),
        );
        expect(yield* Effect.tryPromise(() => event.drain())).toMatchObject([
          { state: "completed" },
        ]);
        expect(published.propagation?.producer.traceId).toMatch(/^[0-9a-f]{32}$/);
        expect(
          eventSpans
            .at(-1)
            ?.links?.some(
              (link) =>
                link.traceId === published.propagation?.producer.traceId &&
                link.spanId === published.propagation?.producer.spanId,
            ),
        ).toBe(true);
        expect(receipts.inspect().map(({ key }) => key)).toEqual(["receipts/order-1.json"]);
      }),
    ),
  ));
