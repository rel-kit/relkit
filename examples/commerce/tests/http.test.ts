import { afterAll, expect, test } from "bun:test";
import { resolve } from "node:path";
import { createTestApplication, createTestBucketFake, createTestCacheFake } from "@relkit/testing";
import config from "../relkit.config.js";

const assets = createTestBucketFake({ bucketId: "assets" });
const application = await createTestApplication(config, {
  projectRoot: resolve(import.meta.dir, ".."),
  providers: {
    bucket: {
      assets,
      receipts: createTestBucketFake({ bucketId: "receipts" }),
    },
    cache: {
      requests: createTestCacheFake({ cacheId: "requests" }),
      timeline: createTestCacheFake({ cacheId: "timeline" }),
    },
    model: {
      openai: {
        resolveModel: (selector = "openai:gpt-5-mini") => ({ id: selector, model: {} }),
      },
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

afterAll(() => application.close());
