import { describe, expect, test } from "bun:test";
import { createGenerationLifecycle } from "./src/lifecycle.ts";
import { createConcurrencyAdmission, effectiveConcurrencyLimit } from "./src/concurrency.ts";

const request = (
  admission: ReturnType<typeof createConcurrencyAdmission>,
  overrides: Partial<Parameters<typeof admission.acquire>[0]> = {},
) =>
  admission.acquire({
    functionId: "orders.create",
    source: "direct",
    signal: new AbortController().signal,
    ...overrides,
  });

describe("concurrency admission", () => {
  test("uses the stricter function and trigger limit without counting waiters", async () => {
    const lifecycle = createGenerationLifecycle();
    lifecycle.markReady();
    const admission = createConcurrencyAdmission({
      generation: lifecycle,
      generationId: "generation-1",
    });

    const first = await request(admission, { limit: 2, triggerId: "route", triggerLimit: 1 });
    const second = request(admission, { limit: 2, triggerId: "route", triggerLimit: 1 });
    expect(admission.activeCount("orders.create")).toBe(1);
    expect(admission.waitingCount("orders.create")).toBe(1);
    expect(lifecycle.activeCount).toBe(1);
    expect(effectiveConcurrencyLimit(2, 1)).toBe(1);

    first.release();
    const next = await second;
    expect(admission.activeCount("orders.create")).toBe(1);
    expect(admission.waitingCount("orders.create")).toBe(0);
    expect(lifecycle.activeCount).toBe(1);
    next.release();
    expect(admission.activeCount("orders.create")).toBe(0);
    expect(lifecycle.activeCount).toBe(0);
  });

  test("keeps FIFO order among live waiters and removes cancelled waiters", async () => {
    const admission = createConcurrencyAdmission();
    const first = await request(admission, { limit: 1 });
    const cancelled = new AbortController();
    const cancelledWaiter = request(admission, { limit: 1, signal: cancelled.signal });
    const third = request(admission, { limit: 1 });
    cancelled.abort(new Error("cancelled"));
    await expect(cancelledWaiter).rejects.toThrow("cancelled");
    expect(admission.activeCount("orders.create")).toBe(1);
    expect(admission.waitingCount("orders.create")).toBe(1);

    first.release();
    const next = await third;
    expect(admission.waitingCount("orders.create")).toBe(0);
    next.release();
  });
});
