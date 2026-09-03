import { expect, test } from "bun:test";
import { createInspectorApiClient } from "./api";
import { logDetail, traceDetail } from "./observability-api";

test("preserves the log-detail 404 status from the shared inspector error envelope", async () => {
  const client = createInspectorApiClient({
    fetch: async () =>
      response("relkit.inspector", { error: "RELKIT_OBSERVABILITY_NOT_FOUND" }, 404),
  });
  await expect(logDetail(client, "42")).rejects.toMatchObject({ status: 404 });
});

test("surfaces a missing trace detail backend without substituting list data", async () => {
  const client = createInspectorApiClient({
    cacheTtlMs: 0,
    fetch: async (url) =>
      String(url).endsWith("/traces/trace-1")
        ? response("relkit.observability.query", { error: "not-found" }, 404)
        : response("relkit.inspector", {
            items: [
              {
                signal: "span",
                spanId: "span-1",
                traceId: "trace-1",
                startedAt: "2026-08-19T12:00:00.000Z",
                completedAt: "2026-08-19T12:00:00.010Z",
              },
            ],
          }),
  });

  await expect(traceDetail(client, "trace-1")).rejects.toThrow();
});

function response(protocol: string, payload: object, status = 200): Response {
  return new Response(JSON.stringify({ protocol, version: 1, ...payload }), {
    status,
    headers: { "x-relkit-api-version": "1" },
  });
}
