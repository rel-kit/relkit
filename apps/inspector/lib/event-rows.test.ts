import { describe, expect, test } from "bun:test";
import type { InspectorEventRuntime } from "./api-types";
import {
  countLabel,
  deliveryTime,
  deliveryTraceId,
  mergeEventRuntime,
  payloadPreview,
  publicationRequestId,
  publicationTime,
  publicationTraceId,
  stateCounts,
} from "./event-rows";

const runtime = (over: Partial<InspectorEventRuntime> = {}): InspectorEventRuntime => ({
  protocol: "relkit.inspector",
  version: 1,
  eventProtocol: "relkit.events.admin",
  eventVersion: 1,
  events: [],
  triggers: [],
  capabilities: [],
  publications: [],
  items: [],
  deliveries: [],
  deadLetters: [],
  ...over,
});

describe("counts that say whether they are the whole", () => {
  test("a full page with more behind it reads as a lower bound", () => {
    expect(countLabel(100, { hasMore: true })).toBe("100+");
  });

  test("a total from the provider is the number", () => {
    expect(countLabel(100, { total: 230, hasMore: true })).toBe("230");
    expect(countLabel(3, { total: 3, hasMore: false })).toBe("3");
  });

  test("a page without more behind it is the whole", () => {
    expect(countLabel(25, { hasMore: false })).toBe("25");
  });

  test("states come from the provider's counts when it reports them", () => {
    const deliveries = [{ state: "completed" }, { state: "available" }];
    expect(
      stateCounts(deliveries, { reported: { completed: 90, "dead-lettered": 2 }, hasMore: true }),
    ).toMatchObject({ counts: { completed: 90, available: 0, "dead-lettered": 2 }, exact: true });
  });

  test("states from the loaded page are exact only when nothing is left to load", () => {
    const deliveries = [{ state: "completed" }, { state: "completed" }, { state: "leased" }];
    expect(stateCounts(deliveries, { hasMore: true })).toMatchObject({
      counts: { completed: 2, leased: 1 },
      exact: false,
    });
    expect(stateCounts(deliveries, { hasMore: false }).exact).toBe(true);
  });
});

describe("loading the next page of an event's runtime", () => {
  test("appends new deliveries and publications and takes the new cursor", () => {
    const first = runtime({
      deliveries: [{ deliveryId: "d1", eventId: "e" }],
      publications: [{ instanceId: "p1", eventId: "e" }],
      nextCursor: "c1",
      total: 3,
    });
    const next = runtime({
      deliveries: [
        { deliveryId: "d1", eventId: "e" },
        { deliveryId: "d2", eventId: "e" },
      ],
      publications: [{ instanceId: "p2", eventId: "e" }],
    });
    const merged = mergeEventRuntime(first, next);
    expect(merged.deliveries.map((item) => item.deliveryId)).toEqual(["d1", "d2"]);
    expect(merged.items.map((item) => item.deliveryId)).toEqual(["d1", "d2"]);
    expect(merged.publications.map((item) => item.instanceId)).toEqual(["p1", "p2"]);
    expect(merged.nextCursor).toBeUndefined();
    expect(merged.total).toBe(3);
  });
});

describe("what a row shows about a record", () => {
  test("a short payload preview, when the API returns one", () => {
    expect(payloadPreview({ payload: { orderId: "o1" } })).toBe('{"orderId":"o1"}');
    expect(payloadPreview({ payloadPreview: '{"a":1}' })).toBe('{"a":1}');
    expect(payloadPreview({ payload: { text: "x".repeat(200) } })?.length).toBe(81);
    expect(payloadPreview({ payload: { text: "x".repeat(200) } })?.endsWith("…")).toBe(true);
    expect(payloadPreview({ instanceId: "p1" })).toBeUndefined();
  });

  test("the time of a publication and of a delivery", () => {
    expect(publicationTime({ publishedAt: "2026-01-01T00:00:00.000Z", timestamp: "x" })).toBe(
      "2026-01-01T00:00:00.000Z",
    );
    expect(publicationTime({ timestamp: "2026-01-02T00:00:00.000Z" })).toBe(
      "2026-01-02T00:00:00.000Z",
    );
    expect(deliveryTime({ updatedAt: "u", createdAt: "c" })).toBe("u");
    expect(deliveryTime({})).toBe("");
  });

  test("the API sends the time of a record as epoch milliseconds", () => {
    const at = Date.UTC(2026, 10, 15, 8, 30, 0);
    expect(deliveryTime({ deliveryId: "d1", timestamp: at })).toBe("2026-11-15T08:30:00.000Z");
    expect(publicationTime({ instanceId: "p1", timestamp: at })).toBe("2026-11-15T08:30:00.000Z");
    expect(deliveryTime({ timestamp: Number.NaN })).toBe("");
    expect(deliveryTime({ timestamp: 0 })).toBe("");
  });

  test("a publication names its trace by the trace id or the producer's trace id", () => {
    expect(publicationTraceId({ traceId: "t1" })).toBe("t1");
    expect(publicationTraceId({ producerTraceId: "t2" })).toBe("t2");
    expect(publicationTraceId({ instanceId: "p1" })).toBeUndefined();
    expect(publicationRequestId({ originRequestId: "r1" })).toBe("r1");
    expect(publicationRequestId({})).toBeUndefined();
  });

  test("a delivery links to the trace of the publication it belongs to", () => {
    const publications = [{ instanceId: "p1", traceId: "t1" }, { instanceId: "p2" }];
    expect(deliveryTraceId({ eventInstanceId: "p1" }, publications)).toBe("t1");
    expect(deliveryTraceId({ eventInstanceId: "p2" }, publications)).toBeUndefined();
    expect(deliveryTraceId({}, publications)).toBeUndefined();
    expect(
      deliveryTraceId({ eventInstanceId: "p3" }, [{ instanceId: "p3", producerTraceId: "t3" }]),
    ).toBe("t3");
  });
});
