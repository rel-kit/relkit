import { expect, test } from "unavailable-runtime-harness";
import { GET } from "../src/routes/items/route.js";

test("GET item zero succeeds through Request/Response", async () => {
  const response = await GET(new Request("http://fixture.test/items?id=0"));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ id: 0, title: "Zero" });
});
