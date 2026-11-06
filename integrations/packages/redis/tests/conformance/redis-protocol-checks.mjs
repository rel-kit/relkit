// Redis protocol checks shared by the socket conformance runner (Bun and Node) and the
// Workers conformance Worker, which runs them over HTTP inside workerd.
import { strict as assert } from "node:assert";

/**
 * Checks the protocol client: connection lifecycle, strings, TTLs, counters, scans and raw commands.
 * @param api - `createRedisClient` from `@relkit/redis/runtime`.
 * @param options - Server URL, a unique key prefix and a URL nothing answers on.
 */
export async function checkRedisProtocol({ createRedisClient }, { url, prefix, unreachable }) {
  const client = createRedisClient({ url, connectionTimeoutMs: 2_000 });
  assert.equal(client.connected, false);
  await client.connect();
  assert.equal(client.connected, true);
  try {
    assert.equal(await client.ping(), true);
    const key = `${prefix}:protocol`;
    assert.equal(await client.get(key), null);
    await client.set(key, "one");
    assert.equal(await client.get(key), "one");
    assert.equal(await client.has(key), true);
    assert.equal(await client.type(key), "string");
    assert.equal(await client.ttl(key), -1);
    await client.set(key, "two", 60_000);
    const ttl = await client.ttl(key);
    assert.ok(ttl > 0 && ttl <= 60_000, `PTTL ${ttl}`);
    assert.equal(await client.increment(`${prefix}:counter`, 5), 5);
    assert.equal(await client.increment(`${prefix}:counter`), 6);
    const [cursor, keys] = await client.scan("0", `${prefix}:*`, 100);
    assert.equal(typeof cursor, "string");
    assert.ok(keys.length > 0 && keys.every((name) => name.startsWith(prefix)));
    assert.equal(await client.delete(key), 1);
    assert.equal(await client.has(key), false);
    assert.equal(await client.command("ECHO", ["raw"]), "raw");
    await assert.rejects(client.command("NOT-A-COMMAND", []));
    assert.equal(await client.ping(), true);
  } finally {
    client.close();
  }
  assert.equal(client.connected, false);
  await assert.rejects(client.connect(), /closed/);
  const closedPort = createRedisClient({ url: unreachable, connectionTimeoutMs: 500 });
  await assert.rejects(closedPort.connect());
  closedPort.close();
}
