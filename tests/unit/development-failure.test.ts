import { expect, test } from "bun:test";
import { createInspectorApiClient } from "../../apps/inspector/lib/api";
import type { InspectorObject } from "../../apps/inspector/lib/api-types";
import { loadDevelopmentFailure } from "../../apps/inspector/lib/development-failure";

const failedAt = "2026-10-20T15:58:21.225Z";
const startedAt = "2026-10-20T15:58:00.000Z";
const failed: InspectorObject = {
  origin: "relkit",
  component: "cli.dev",
  message: "dev.generation.failed",
  timestamp: failedAt,
  cursor: "12",
  fields: { message: "Docker container listing failed with exit code 1." },
};

function fixture(pages: readonly (readonly InspectorObject[] | Error)[]) {
  const requests: URL[] = [];
  const client = createInspectorApiClient({
    cacheTtlMs: 0,
    fetch: async (input) => {
      requests.push(new URL(String(input), "http://localhost"));
      const items = pages[requests.length - 1];
      if (items instanceof Error) throw items;
      return Response.json({
        protocol: "relkit.observability.query",
        version: 1,
        items: items ?? [],
      });
    },
  });
  return { client, requests };
}

test("explains Docker failures while preserving the active workspace", async () => {
  const { client, requests } = fixture([[failed], []]);
  const failure = await loadDevelopmentFailure(client);
  expect(failure?.message).toContain("Docker container listing failed");
  expect(failure?.suggestion).toContain("Start Docker Desktop");
  expect(requests[0]?.searchParams.get("source")).toBe("relkit");
  expect(requests[0]?.searchParams.get("order")).toBe("desc");
  expect(failure?.logsHref).toContain("severity=error");
});

test("includes startup errors only from the failed build's time window", async () => {
  const { client, requests } = fixture([
    [{ ...failed, fields: { message: "Candidate health checks timed out." } }],
    [{ origin: "relkit", message: "dev.build.started", timestamp: startedAt }],
    [
      {
        origin: "application",
        message: "Database startup failed",
        fields: {
          detail: "Retention must be an integer from 1 to 365 days",
          error: { stack: "private stack" },
        },
      },
    ],
  ]);
  const failure = await loadDevelopmentFailure(client);
  expect(failure?.details).toEqual([
    "Database startup failed: Retention must be an integer from 1 to 365 days",
  ]);
  expect(requests[2]?.searchParams.get("from")).toBe(startedAt);
  expect(requests[2]?.searchParams.get("to")).toBe(failedAt);
  expect(JSON.stringify(failure)).not.toContain("private stack");
});

test("clears failures after recovery and ignores application lifecycle lookalikes", async () => {
  const { client } = fixture([
    [
      { ...failed, origin: "application", cursor: "15" },
      { ...failed, message: "dev.generation.active", cursor: "14" },
      failed,
    ],
  ]);
  expect(await loadDevelopmentFailure(client)).toBeUndefined();
});

test("keeps the failure visible when startup details are unavailable", async () => {
  const { client } = fixture([[failed], new Error("Details unavailable")]);
  expect((await loadDevelopmentFailure(client))?.details).toEqual([]);
});

test.each(["build", "startup"] as const)(
  "retries a transient %s detail-query failure on the unchanged generation",
  async (stage) => {
    const build = { message: "dev.build.started", timestamp: startedAt };
    const startup = {
      origin: "application",
      message: "Database startup failed",
      fields: { detail: "Retention must be an integer" },
    };
    const unavailable = new Error("Details temporarily unavailable");
    const { client, requests } = fixture([
      [failed],
      ...(stage === "build" ? [unavailable] : [[build], unavailable]),
      [failed],
      [build],
      [startup],
      [failed],
    ]);
    const incomplete = await loadDevelopmentFailure(client);
    expect(incomplete?.details).toEqual([]);
    const recovered = await loadDevelopmentFailure(client, incomplete);
    expect(recovered?.details).toEqual(["Database startup failed: Retention must be an integer"]);
    const detailRequests = requests.length;
    expect(await loadDevelopmentFailure(client, recovered)).toBe(recovered);
    expect(requests).toHaveLength(detailRequests + 1);
  },
);

test("reuses unchanged startup details and handles environments without dev logs", async () => {
  const { client, requests } = fixture([[failed], [], [failed], []]);
  const failure = await loadDevelopmentFailure(client);
  expect(await loadDevelopmentFailure(client, failure)).toBe(failure);
  expect(requests).toHaveLength(3);
  expect(await loadDevelopmentFailure(client, failure)).toBeUndefined();
});
