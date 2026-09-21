import assert from "node:assert/strict";
import type { NativeRun } from "./inngest-native-api.ts";
import { type NativeStack } from "./native-stack.ts";

const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

const parseBody = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const status = (value: string) =>
  ({
    Queued: "queued",
    Running: "running",
    Sleeping: "sleeping",
    Completed: "completed",
    Failed: "failed",
    Cancelled: "cancelled",
  })[value] ?? "unknown";

async function request(stack: NativeStack, path: string, authenticated = true) {
  const response = await fetch(`${stack.baseUrl}${path}`, {
    headers: authenticated ? { Authorization: `Bearer ${stack.signingKey}` } : undefined,
  });
  const text = await response.text();
  return { status: response.status, body: parseBody(text) };
}

const page = (body: unknown) => record(record(body).page);
const rows = (body: unknown) => {
  const data = record(body).data;
  return Array.isArray(data) ? data.map(record) : [];
};
const ids = (body: unknown) =>
  rows(body).flatMap((row) => (typeof row.id === "string" ? [row.id] : []));

export async function runNativeQueryChecks(options: {
  readonly stack: NativeStack;
  readonly eventId: string;
  readonly runId: string;
  readonly eventRuns: (eventId: string) => Promise<NativeRun[]>;
  readonly run: (runId: string) => Promise<NativeRun>;
}) {
  const { stack, eventId, runId, eventRuns, run } = options;
  const appId = `relkit-${stack.namespace}`;
  const functionId = `${stack.namespace}-acceptance`;
  const eventPath = `/v2/events/${encodeURIComponent(eventId)}/runs`;
  const queryUntil = encodeURIComponent(new Date().toISOString());
  const filteredPath = `/v2/runs?limit=1&appId=${encodeURIComponent(appId)}&status=COMPLETED&until=${queryUntil}`;
  const functionPath = `${filteredPath}&functionId=${encodeURIComponent(functionId)}`;
  const generic = await request(stack, filteredPath);
  const functionFiltered = await request(stack, functionPath);
  const scoped = await request(stack, `${eventPath}?limit=1`);
  const genericPage = page(generic.body);
  const genericIds = ids(generic.body);
  const repeatedGeneric = await request(stack, filteredPath);
  assert.deepEqual(ids(repeatedGeneric.body), genericIds);
  assert.equal(functionFiltered.status, 200);
  assert(rows(functionFiltered.body).length > 0);
  assert(
    rows(functionFiltered.body).every(
      (row) => record(row.function).id === functionId && row.status === "COMPLETED",
    ),
  );
  const cursor = typeof genericPage.cursor === "string" ? genericPage.cursor : undefined;
  const hasMore = genericPage.hasMore === true;
  const continuation = cursor
    ? await request(stack, `${filteredPath}&cursor=${encodeURIComponent(cursor)}`)
    : undefined;
  if (hasMore) {
    assert(cursor);
    assert.equal(continuation?.status, 200);
    assert.equal(
      ids(continuation?.body).some((id) => genericIds.includes(id)),
      false,
    );
  }
  const scopedRuns = await eventRuns(eventId);
  const repeatedRuns = await eventRuns(eventId);
  assert.deepEqual(
    repeatedRuns.map((value) => value.run_id),
    scopedRuns.map((value) => value.run_id),
  );
  const unauthorized = await request(stack, eventPath, false);
  assert.equal(unauthorized.status, 401);

  const detail = await run(runId);
  const detailData = record(detail.data);
  const output = detail.output ?? detailData.output ?? detailData.result ?? detailData.response;
  const outputFieldPresent = "output" in detail || "output" in detailData;
  const ownershipFields = Object.keys(detail).filter((key) =>
    ["tenant", "tenant_id", "owner", "scope", "env_id"].includes(key),
  );
  assert.equal(status("ProviderAddedStatus"), "unknown");

  return {
    listing: {
      genericEndpoint: "/v2/runs",
      genericStatus: generic.status,
      eventScopedStatus: scoped.status,
      eventScopedItemCount: scopedRuns.length,
      pageLimit: genericPage.limit,
      hasMore,
      cursorStability: cursor
        ? "native opaque cursor continued without overlap"
        : "no continuation needed",
      fullScanUsed: false,
      result: generic.status === 200 && genericPage.limit === 1 ? "supported" : "unsupported",
    },
    filters: {
      required: ["appId", "functionId", "status", "from", "until", "limit", "cursor"],
      result:
        generic.status === 200 && functionFiltered.status === 200 ? "supported" : "unsupported",
      reason:
        "the pinned local v2 API provides bounded app/status filtering; function filtering requires the app scope",
    },
    authorization: {
      unauthenticatedStatus: unauthorized.status,
      trustedScope: "signing-key scoped",
    },
    detail: {
      runId,
      status: status(detail.status),
      nativeStatus: detail.status,
      fields: Object.keys(detail),
      dataFields: Object.keys(detailData),
      historicalOutputFieldPresent: outputFieldPresent,
      historicalOutputPayloadAvailable: output !== undefined && output !== "",
      historicalSchemaAvailable: false,
      ownershipFields,
    },
    unknownStatus: { input: "ProviderAddedStatus", normalized: status("ProviderAddedStatus") },
  };
}
