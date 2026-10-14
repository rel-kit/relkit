/** Verifies propagated event continuations and native receipt retries under grouped ownership. */
import { expect, test } from "bun:test";
import { Effect } from "effect";
import { instrumentationFixture } from "./fixtures/runtime-instrumentation.js";

test("links an event continuation to a retrying receipt job", () =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const { receipts, job, event, jobSpans, eventSpans } = yield* instrumentationFixture;
        const published = yield* Effect.tryPromise(() =>
          event.publish({
            orderId: "order-1",
            receiptKey: "receipts/order-1.json",
          }),
        );
        expect(yield* Effect.tryPromise(() => event.drain())).toMatchObject([
          { state: "completed" },
        ]);
        const queued = job.get("test-job-receipts.send-1");
        expect(published.propagation?.producer.traceId).toMatch(/^[0-9a-f]{32}$/);
        expect(queued?.propagation?.producer.traceId).toMatch(/^[0-9a-f]{32}$/);
        expect(
          eventSpans
            .at(-1)
            ?.links?.some(
              (link) =>
                link.traceId === published.propagation?.producer.traceId &&
                link.spanId === published.propagation?.producer.spanId,
            ),
        ).toBe(true);
        expect(yield* Effect.tryPromise(() => job.runNext())).toMatchObject({
          state: "delayed",
          classification: "retryable",
          attempt: 1,
        });
        yield* Effect.tryPromise(() => job.clock.advance(10));
        expect(yield* Effect.tryPromise(() => job.runNext())).toMatchObject({
          state: "completed",
          attempt: 2,
        });
        const attempts = jobSpans.filter(
          (span) => span.name === "relkit.invoke.receipts.retrying-send",
        );
        expect(attempts).toHaveLength(2);
        expect(
          attempts.every(
            (span) =>
              span.links?.some((link) => link.traceId === queued?.propagation?.producer.traceId) ===
              true,
          ),
        ).toBe(true);
        expect(receipts.inspect().map(({ key }) => key)).toEqual(["receipts/order-1.json"]);
      }),
    ),
  ));
