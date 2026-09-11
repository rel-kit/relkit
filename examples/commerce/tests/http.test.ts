import { afterAll, expect, test } from "bun:test";
import { resolve } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  createTestAgentStateProvider,
  createTestApplication,
  createTestBucketFake,
  createTestCacheFake,
  createTestRealtimeProvider,
} from "@relkit/testing";
import config from "../relkit.config.js";

const assets = createTestBucketFake({ bucketId: "assets" });
const stateRoot = await mkdtemp(resolve(tmpdir(), "relkit-commerce-providers-"));
const application = await createTestApplication(config, {
  projectRoot: resolve(import.meta.dir, ".."),
  env: { DATABASE_PATH: resolve(stateRoot, "commerce.sqlite") },
  providers: {
    bucket: {
      "agent-workspace": createTestBucketFake({ bucketId: "agent-workspace" }),
      assets,
      receipts: createTestBucketFake({ bucketId: "receipts" }),
    },
    cache: {
      requests: createTestCacheFake({ cacheId: "requests" }),
      timeline: createTestCacheFake({ cacheId: "timeline" }),
    },
    realtime: { default: createTestRealtimeProvider(resolve(stateRoot, "realtime")) },
    "agent-state": {
      agents: createTestAgentStateProvider(resolve(stateRoot, "agent-state")),
    },
  },
});

test("exercises file routes, inferred requests, middleware, methods, and uploads", async () => {
  expect(await (await application.http.get("/orders/search?status=open")).json()).toEqual({
    status: "open",
    count: 1,
  });
  expect(
    await (
      await application.http.patch("/orders/order-1", {
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state: "shipped" }),
      })
    ).json(),
  ).toMatchObject({ orderId: "order-1", status: "shipped" });
  expect(
    (
      await application.http.get("/orders/order-1", {
        headers: { authorization: "Bearer example" },
      })
    ).status,
  ).toBe(200);
  expect(await (await application.http.get("/docs/guides/routes")).json()).toEqual({
    path: "/guides/routes",
  });
  expect(await (await application.http.request("/orders/order-1", { method: "HEAD" })).text()).toBe(
    "",
  );

  const form = new FormData();
  form.append("label", "receipts");
  form.append("primary", new File(["primary"], "primary.png", { type: "image/png" }));
  form.append("attachments", new File(["detail"], "detail.png", { type: "image/png" }));
  expect(await (await application.http.post("/uploads", { body: form })).json()).toEqual({
    label: "receipts",
    files: ["primary.png", "detail.png"],
  });
  expect(assets.inspect().map(({ key }) => key)).toEqual(["detail.png", "primary.png"]);
});

test("preserves concurrent announcements", async () => {
  const messages = Array.from({ length: 20 }, (_, index) => `announcement-${index}`);
  const responses = await Promise.all(
    messages.map((message) =>
      application.http.post("/announcements", {
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message }),
      }),
    ),
  );
  expect(
    await Promise.all(
      responses.map(async (response) => ({ status: response.status, body: await response.text() })),
    ),
  ).toEqual(messages.map(() => ({ status: 200, body: JSON.stringify({ accepted: true }) })));
  const result = (await (await application.http.get("/announcements")).json()) as {
    messages: string[];
  };
  expect(result.messages.sort()).toEqual(messages.sort());
});

afterAll(async () => {
  await application.close();
  await rm(stateRoot, { recursive: true, force: true });
});
