import { expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { openDuckdbDatabase } from "../src/local/duckdb-database.js";

test("request pagination chooses completed lifecycles before paging and filtering", async () => {
  const root = await mkdtemp(join("/tmp", "relkit-request-pages-"));
  const database = await openDuckdbDatabase(root);
  try {
    const started = (requestId: string) => ({
      version: 2 as const,
      signal: "request" as const,
      phase: "started" as const,
      requestId,
      originRequestId: requestId,
      traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
      startedAt: new Date().toISOString(),
      method: "GET",
      rawPath: "/hello",
    });
    await database.append(
      ["one", "two", "three"].flatMap((requestId) => [
        { key: `${requestId}:start`, origin: "application" as const, record: started(requestId) },
        {
          key: `${requestId}:end`,
          origin: "application" as const,
          record: {
            ...started(requestId),
            phase: "completed" as const,
            outcome: "success" as const,
            status: 200,
            completedAt: new Date().toISOString(),
            durationMs: 0,
            routeId: "hello",
            normalizedRoute: "/hello",
            functionId: "hello.hello",
            invocationId: requestId,
          },
        },
      ]),
    );
    const first = await database.list("requests", { limit: 2 });
    expect(first.items.map((item) => item.requestId)).toEqual(["one", "two"]);
    expect(first.items.every((item) => item.phase === "completed")).toBe(true);
    const second = await database.list("requests", { limit: 2, cursor: first.nextCursor });
    expect(second.items.map((item) => item.requestId)).toEqual(["three"]);
    expect(second.nextCursor).toBeUndefined();
    expect((await database.list("requests", { order: "desc", limit: 10 })).items).toHaveLength(3);
    expect((await database.list("requests", { routeId: "unknown" })).items).toEqual([]);
    expect((await database.list("requests", { requestId: "one" })).items).toHaveLength(1);
  } finally {
    await database.close();
    await rm(root, { recursive: true, force: true });
  }
});
