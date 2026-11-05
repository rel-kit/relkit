// Cache and bucket contract checks for the Workers binding providers, run inside workerd by the
// Workers conformance Worker against wrangler's local KV namespace and R2 bucket.
import { strict as assert } from "node:assert";

/**
 * Checks a cache provider on a KV binding: canonical keys, JSON values, has, delete, getOrSet and
 * the 60-second TTL floor KV imposes.
 * @param provider - Cache provider under test.
 */
export async function checkKvCache(provider) {
  const key = { sku: "sku-1", region: "eu" };
  assert.equal(await provider.get(key), undefined);
  await provider.set(key, { nested: [1, 2] });
  assert.deepEqual(await provider.get({ region: "eu", sku: "sku-1" }), { nested: [1, 2] });
  assert.equal(await provider.has(key), true);
  await provider.delete(key);
  assert.equal(await provider.has(key), false);
  let produced = 0;
  const produce = () => {
    produced += 1;
    return "fresh";
  };
  assert.equal(await provider.getOrSet("memo", produce, { ttlMs: 60_000 }), "fresh");
  assert.equal(await provider.getOrSet("memo", produce, { ttlMs: 60_000 }), "fresh");
  assert.equal(produced, 1);
  await assert.rejects(provider.set("short", 1, { ttlMs: 1_000 }), /at least 60000/);
  const capabilities = provider.capabilities;
  assert.equal(capabilities.increment, false);
  await provider.close();
  await assert.rejects(provider.get(key), /closed/);
}

/**
 * Checks a bucket provider on an R2 binding: put, get, head with metadata, exists, prefix listing
 * across nested keys, delete and the absence of signed URLs.
 * @param provider - Bucket provider under test.
 * @param prefix - Unique key prefix.
 */
export async function checkR2Bucket(provider, prefix) {
  const key = `${prefix}/reports/one.txt`;
  const bytes = new TextEncoder().encode("hello workers");
  assert.equal(await provider.get(key), undefined);
  assert.equal(await provider.head(key), undefined);
  assert.equal(await provider.exists(key), false);
  await provider.put(key, bytes, { contentType: "text/plain", metadata: { owner: "conformance" } });
  assert.deepEqual(await provider.get(key), bytes);
  const head = await provider.head(key);
  assert.equal(head.size, bytes.byteLength);
  assert.equal(head.contentType, "text/plain");
  assert.deepEqual(head.metadata, { owner: "conformance" });
  assert.ok(head.etag.length > 0 && !head.etag.includes('"'));
  assert.equal(await provider.exists(key), true);
  await provider.put(`${prefix}/reports/two.txt`, bytes);
  await provider.put(`${prefix}/other.txt`, bytes);
  assert.deepEqual([...(await provider.list(`${prefix}/reports/`))].sort(), [
    `${prefix}/reports/one.txt`,
    `${prefix}/reports/two.txt`,
  ]);
  assert.equal((await provider.list(`${prefix}/`)).length, 3);
  await provider.delete(key);
  assert.equal(await provider.exists(key), false);
  assert.deepEqual(provider.capabilities, { signedReadUrl: false, signedWriteUrl: false });
  assert.equal(provider.createReadUrl, undefined);
}
