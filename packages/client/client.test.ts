import { expect, test } from "bun:test";
import { oc } from "@orpc/contract";
import { createClient } from "./src/index.ts";

const schema = {
  "~standard": {
    version: 1 as const,
    vendor: "test",
    validate: (value: unknown) => ({ value }),
  },
};
const contract = { ping: oc.input(schema).output(schema) } as const;

test("reads mutable Headers for each future request and includes credentials", async () => {
  const headers = new Headers();
  const seen: { authorization: string | null; credentials: RequestCredentials | undefined }[] = [];
  const client = createClient<typeof contract>({
    baseUrl: "https://api.example.test",
    headers,
    fetch: async (_input, init) => {
      seen.push({
        authorization: new Headers(init?.headers).get("authorization"),
        credentials: init?.credentials,
      });
      return Response.json({}, { status: 500 });
    },
  });

  await client.ping({}).catch(() => undefined);
  headers.set("authorization", "Bearer current");
  await client.ping({}).catch(() => undefined);
  headers.delete("authorization");
  await client.ping({}).catch(() => undefined);

  expect(seen).toEqual([
    { authorization: null, credentials: "include" },
    { authorization: "Bearer current", credentials: "include" },
    { authorization: null, credentials: "include" },
  ]);
});

test("evaluates async headers for each request and honors credentials overrides", async () => {
  let token: string | undefined;
  const seen: (string | null)[] = [];
  const client = createClient<typeof contract>({
    baseUrl: "https://api.example.test/root/",
    credentials: "same-origin",
    headers: async () => (token === undefined ? {} : { authorization: `Bearer ${token}` }),
    fetch: async (_input, init) => {
      expect(init?.credentials).toBe("same-origin");
      seen.push(new Headers(init?.headers).get("authorization"));
      return Response.json({}, { status: 500 });
    },
  });

  token = "one";
  await client.ping({}).catch(() => undefined);
  token = "two";
  await client.ping({}).catch(() => undefined);
  expect(seen).toEqual(["Bearer one", "Bearer two"]);
});
