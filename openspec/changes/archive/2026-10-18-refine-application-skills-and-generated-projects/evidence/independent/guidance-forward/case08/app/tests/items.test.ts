import { expect, test } from "bun:test";
import { GET } from "../src/routes/items/route.js";

test("GET item zero succeeds through Request/Response", async () => {
  const response = await GET(new Request("http://fixture.test/items?id=0"));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ id: 0, title: "Zero" });
});

test("existing, absent and malformed IDs retain their contracts", async () => {
  expect((await GET(new Request("http://fixture.test/items?id=1"))).status).toBe(200);
  for (const query of ["", "?id=", "?id=  ", "?id=nope", "?id=-1", "?id=1.5", "?id=2"]) {
    const response = await GET(new Request(`http://fixture.test/items${query}`));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found" });
  }
});
