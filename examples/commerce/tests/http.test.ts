import { afterAll, expect, test } from "bun:test";
import { resolve } from "node:path";
import { createTestApplication } from "@zsys/testing";
import config from "../zsys.config.js";

const application = await createTestApplication(config, {
  projectRoot: resolve(import.meta.dir, ".."),
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
  const assetsBucket = application.fakes.buckets.assets;
  if (assetsBucket === undefined) throw new Error("Assets bucket fake was not created");
  expect(assetsBucket.inspect().map(({ key }) => key)).toEqual([
    "detail.png",
    "primary.png",
  ]);
});

afterAll(() => application.close());
