/**
 * The HTTP Redis client sends `[command, ...args]` as JSON with the URL's password as a bearer
 * token, maps `{ error }` to a rejection, and the state providers refuse HTTP URLs because waiting
 * for changes needs a blocking read. The full protocol and cache checks run over HTTP inside workerd
 * in `@relkit/cloudflare`'s Workers conformance test.
 */
import { afterAll, expect, test } from "bun:test";
import { createRedisClient } from "../src/runtime/client.ts";
import { redisHttpEndpoint } from "../src/runtime/redis-native.http.ts";
import { createRedisAgentStateProvider } from "../src/runtime/agent-state-provider.ts";

const received: { authorization: string | null; body: unknown; url: string }[] = [];
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    const body = (await request.json()) as string[];
    received.push({ authorization: request.headers.get("authorization"), body, url: request.url });
    if (body[0] === "PING") return Response.json({ result: "PONG" });
    if (body[0] === "GET") return Response.json({ result: null });
    if (body[0] === "INCRBY") return Response.json({ result: 7 });
    return Response.json({ error: "ERR unknown command" }, { status: 400 });
  },
});
afterAll(() => server.stop(true));

test("the token moves from the URL to a bearer header", () => {
  expect(redisHttpEndpoint("https://default:s3cr%2Ft@redis.example/")).toEqual({
    url: "https://redis.example/",
    token: "s3cr/t",
  });
  expect(redisHttpEndpoint("http://127.0.0.1:8080").token).toBeUndefined();
});

test("commands travel as JSON and errors reject", async () => {
  const client = createRedisClient({ url: `http://:token@127.0.0.1:${server.port}` });
  expect(client.connected).toBe(false);
  await client.connect();
  expect(client.connected).toBe(true);
  expect(await client.get("missing")).toBeNull();
  expect(await client.increment("counter", 7)).toBe(7);
  await expect(client.command("NOPE", ["x"])).rejects.toThrow("ERR unknown command");
  client.close();
  expect(client.connected).toBe(false);
  await expect(client.connect()).rejects.toThrow("closed");
  expect(received.map(({ body }) => body)).toEqual([
    ["PING"],
    ["GET", "missing"],
    ["INCRBY", "counter", "7"],
    ["NOPE", "x"],
  ]);
  expect(new Set(received.map(({ authorization }) => authorization))).toEqual(
    new Set(["Bearer token"]),
  );
  expect(received.every(({ url }) => !url.includes("token"))).toBe(true);
});

test("URLs other than redis and http schemes are refused, and state needs a socket", () => {
  expect(() => createRedisClient({ url: "ftp://127.0.0.1" })).toThrow(
    "Redis URL must use redis://, rediss://, http:// or https://",
  );
  expect(() =>
    createRedisAgentStateProvider({ url: "https://:t@redis.example", profile: "state" }),
  ).toThrow("need a socket URL");
});
