/**
 * Spike for OTLP metrics export. It aggregates RelKit request records into the OpenTelemetry
 * `http.server.request.duration` histogram and posts OTLP/HTTP JSON to an in-process receiver.
 * The encoder lives in this test on purpose: the decision in the lead-review design record
 * (section 27) adopts the approach, and the production exporter follows separately.
 */
import { afterAll, beforeAll, expect, test } from "bun:test";
import { admitObservabilityRecord, type RedactedObservabilityRecord } from "relkit/observability";

/** Explicit bucket bounds the HTTP semantic conventions recommend, in seconds. */
const BOUNDS = [0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1, 2.5, 5, 7.5, 10];

interface Attribute {
  readonly key: string;
  readonly value: { readonly stringValue?: string; readonly intValue?: string };
}

interface Point {
  readonly attributes: readonly Attribute[];
  readonly count: string;
  readonly sum: number;
  readonly bucketCounts: readonly string[];
  readonly explicitBounds: readonly number[];
  readonly min: number;
  readonly max: number;
}

interface MetricsBody {
  readonly resourceMetrics: readonly {
    readonly resource: { readonly attributes: readonly Attribute[] };
    readonly scopeMetrics: readonly {
      readonly scope: { readonly name: string };
      readonly metrics: readonly {
        readonly name: string;
        readonly unit: string;
        readonly histogram: {
          readonly aggregationTemporality: number;
          readonly dataPoints: readonly Point[];
        };
      }[];
    }[];
  }[];
}

interface Received {
  readonly path: string;
  readonly contentType: string | null;
  readonly body: MetricsBody;
}

const received: Received[] = [];
let collector: Bun.Server<undefined>;

beforeAll(() => {
  collector = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: async (request) => {
      received.push({
        path: new URL(request.url).pathname,
        contentType: request.headers.get("content-type"),
        body: (await request.json()) as MetricsBody,
      });
      return Response.json({});
    },
  });
});

afterAll(async () => {
  await collector.stop(true);
});

test("exports request durations as an OTLP histogram that follows the HTTP semantic conventions", async () => {
  const records = [
    request("GET", "/orders/:id", 200, 4),
    request("GET", "/orders/:id", 200, 80),
    request("GET", "/orders/:id", 200, 1_200),
    request("POST", "/orders", 500, 30, "internal-error"),
  ];

  const payload = requestDurationMetrics("orders", records, "2026-09-02T00:00:01.000Z");
  const response = await fetch(new URL("/v1/metrics", collector.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  expect(response.status).toBe(200);
  expect(received).toHaveLength(1);
  const [delivery] = received;
  expect(delivery?.path).toBe("/v1/metrics");
  expect(delivery?.contentType).toBe("application/json");

  const resource = delivery!.body.resourceMetrics[0]!;
  expect(resource.resource.attributes).toContainEqual({
    key: "service.name",
    value: { stringValue: "orders" },
  });
  const metric = resource.scopeMetrics[0]!.metrics[0]!;
  expect(resource.scopeMetrics[0]!.scope.name).toBe("relkit");
  expect(metric).toMatchObject({ name: "http.server.request.duration", unit: "s" });
  expect(metric.histogram.aggregationTemporality).toBe(2);
  expect(metric.histogram.dataPoints).toHaveLength(2);

  const get = metric.histogram.dataPoints.find((point) =>
    point.attributes.some((a) => a.key === "http.request.method" && a.value.stringValue === "GET"),
  )!;
  expect(get.attributes).toEqual([
    { key: "http.request.method", value: { stringValue: "GET" } },
    { key: "http.response.status_code", value: { intValue: "200" } },
    { key: "http.route", value: { stringValue: "/orders/:id" } },
  ]);
  expect(get.count).toBe("3");
  expect(get.explicitBounds).toEqual(BOUNDS);
  // 4 ms and 80 ms and 1.2 s land in the (0, 0.005], (0.075, 0.1] and (1, 2.5] buckets.
  expect(get.bucketCounts).toHaveLength(BOUNDS.length + 1);
  expect(get.bucketCounts[0]).toBe("1");
  expect(get.bucketCounts[5]).toBe("1");
  expect(get.bucketCounts[10]).toBe("1");
  expect(Number(get.sum)).toBeCloseTo(1.284, 6);
  expect(get.min).toBeCloseTo(0.004, 6);
  expect(get.max).toBeCloseTo(1.2, 6);

  const failed = metric.histogram.dataPoints.find((point) =>
    point.attributes.some((a) => a.key === "error.type"),
  )!;
  expect(failed.attributes).toContainEqual({
    key: "error.type",
    value: { stringValue: "internal-error" },
  });
  expect(failed.attributes).toContainEqual({
    key: "http.response.status_code",
    value: { intValue: "500" },
  });
});

test("skips request records that have not completed", () => {
  const started = request("GET", "/orders", 200, 1, undefined, "started");
  const payload = requestDurationMetrics("orders", [started], "2026-09-02T00:00:01.000Z");
  expect(payload.resourceMetrics[0]?.scopeMetrics[0]?.metrics[0]?.histogram.dataPoints).toEqual([]);
});

/** Groups completed request records by method, route, status and error and builds the payload. */
function requestDurationMetrics(
  serviceName: string,
  records: readonly RedactedObservabilityRecord[],
  now: string,
) {
  const groups = new Map<
    string,
    { attributes: Record<string, string | number>; seconds: number[] }
  >();
  for (const record of records) {
    if (record.signal !== "request" || record.phase !== "completed") continue;
    if (record.durationMs === undefined) continue;
    const attributes: Record<string, string | number> = {
      "http.request.method": record.method,
      ...(record.normalizedRoute === undefined ? {} : { "http.route": record.normalizedRoute }),
      ...(record.status === undefined ? {} : { "http.response.status_code": record.status }),
      ...(record.errorId === undefined ? {} : { "error.type": record.errorId }),
    };
    const key = JSON.stringify(Object.entries(attributes).sort());
    const group = groups.get(key) ?? { attributes, seconds: [] };
    group.seconds.push(record.durationMs / 1_000);
    groups.set(key, group);
  }
  const startTimeUnixNano = "1788307200000000000";
  const timeUnixNano = String(BigInt(Date.parse(now)) * 1_000_000n);
  return {
    resourceMetrics: [
      {
        resource: { attributes: attributeList({ "service.name": serviceName }) },
        scopeMetrics: [
          {
            scope: { name: "relkit" },
            metrics: [
              {
                name: "http.server.request.duration",
                description: "Duration of HTTP server requests.",
                unit: "s",
                histogram: {
                  aggregationTemporality: 2,
                  dataPoints: [...groups.values()].map(({ attributes, seconds }) => {
                    const counts = BOUNDS.map(() => 0).concat(0);
                    for (const value of seconds) {
                      const index = BOUNDS.findIndex((bound) => value <= bound);
                      counts[index === -1 ? BOUNDS.length : index]! += 1;
                    }
                    return {
                      attributes: attributeList(attributes),
                      startTimeUnixNano,
                      timeUnixNano,
                      count: String(seconds.length),
                      sum: seconds.reduce((total, value) => total + value, 0),
                      bucketCounts: counts.map(String),
                      explicitBounds: BOUNDS,
                      min: Math.min(...seconds),
                      max: Math.max(...seconds),
                    };
                  }),
                },
              },
            ],
          },
        ],
      },
    ],
  };
}

function attributeList(values: Readonly<Record<string, string | number>>) {
  return Object.entries(values)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => ({
      key,
      value: typeof value === "string" ? { stringValue: value } : { intValue: String(value) },
    }));
}

function request(
  method: string,
  route: string,
  status: number,
  durationMs: number,
  errorId?: string,
  phase: "started" | "completed" = "completed",
): RedactedObservabilityRecord {
  return admitObservabilityRecord({
    version: 2,
    signal: "request",
    timestamp: "2026-09-02T00:00:00.000Z",
    phase,
    requestId: `request-${method}-${durationMs}`,
    traceId: "10000000000000000000000000000001",
    generationId: "generation-1",
    graphHash: "hash-1",
    startedAt: "2026-09-02T00:00:00.000Z",
    completedAt: "2026-09-02T00:00:00.100Z",
    durationMs,
    method,
    rawPath: route,
    normalizedRoute: route,
    status,
    outcome: status >= 500 ? "error" : "success",
    ...(errorId === undefined ? {} : { errorId }),
  } as Parameters<typeof admitObservabilityRecord>[0])!;
}
