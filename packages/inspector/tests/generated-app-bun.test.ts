/** Real generated app -> CLI capture -> private bridge -> standalone DuckDB/UI, across reload and restart. */
import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  generatedAppFixture,
  launchGeneratedTool,
  toolReply,
} from "../../../tests/fixtures/inspector/generated-app.js";

/**
 * Reads generated application storage ownership from the generation's server entry. Development
 * runs `server/index.ts` directly; only a build bundles it into `server/index.js`.
 */
async function assertLeanBundle(directory: string) {
  const bundle = await readFile(join(directory, "server/index.ts"), "utf8");
  expect(bundle).not.toContain("duckdb.node");
  expect(bundle).not.toContain("@duckdb/node-api");
}

test("generated requests retain correlated logs and traces across app reload and tool restart", async () => {
  const f = await generatedAppFixture();
  let tool: Awaited<ReturnType<typeof launchGeneratedTool>> | undefined;
  try {
    const backend = `http://127.0.0.1:${f.session.backendPort}`;
    expect((await fetch(`${backend}/hello?name=Persistence`)).status).toBe(200);
    expect((await fetch(`${backend}/missing-route`)).status).toBe(404);
    await assertLeanBundle(f.session.active!.directory);
    tool = await launchGeneratedTool(f.projectRoot);
    expect(await toolReply(tool, "/_relkit/v1/graph", "graphHash")).toContain("graphHash");
    const page = JSON.parse(
      await toolReply(tool, "/_relkit/v1/logs?order=desc", "hello invoked"),
    ) as {
      items: {
        message: string;
        spanId?: string;
        traceId?: string;
        cursor: string;
        component: string;
        level: string;
        fields?: { path?: string; status?: number };
      }[];
    };
    const appLog = page.items.find((item) => item.message === "hello invoked")!;
    expect(appLog.spanId).toBeString();
    expect(await toolReply(tool, `/_relkit/v1/traces/${appLog.traceId}`, appLog.spanId!)).toContain(
      appLog.spanId!,
    );
    // Both request lines are retained; a 404 no route answered is logged at info, like a 200.
    for (const [path, status] of [
      ["/hello", 200],
      ["/missing-route", 404],
    ] as const)
      expect(
        page.items.some(
          (item) =>
            item.component === "runtime.http" &&
            item.level === "info" &&
            item.fields?.path === path &&
            item.fields.status === status,
        ),
      ).toBe(true);
    const identity = f.session.inspectionConnection!.descriptor;
    expect(await f.session.notifySourceChange(1, ["src/platform/env.ts"])).toBe(true);
    expect(f.session.inspectionConnection!.descriptor).toEqual(identity);
    expect(
      await toolReply(tool, `/_relkit/v1/logs/${appLog.cursor}`, "hello invoked"),
    ).not.toContain(identity.token);
    await tool.close();
    tool = undefined;
    expect((await fetch(`${backend}/hello?name=StillServing`)).status).toBe(200);
    tool = await launchGeneratedTool(f.projectRoot);
    expect(await toolReply(tool, `/_relkit/v1/logs/${appLog.cursor}`, "hello invoked")).toContain(
      appLog.cursor,
    );
  } finally {
    await tool?.close();
    await f.close();
  }
}, 90_000);
