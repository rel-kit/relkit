/** Stops only disposable, project-labelled storage containers. Existing provider instances must
 * reject downtime operations, preserve acknowledged data, and resume after the same container restarts. */
import { expect, test } from "bun:test";
import type { DockerClient } from "../../integrations/packages/docker/src/runtime/index.ts";
import { createRedisCacheProvider } from "../../integrations/packages/redis/src/runtime/index.ts";
import { createS3BucketProvider } from "../../integrations/packages/s3/src/runtime/index.ts";
import { createBucketClient } from "../../packages/buckets/src/index.ts";
import { createCacheClient } from "../../packages/cache/src/index.ts";
import { z } from "../../packages/schema/src/index.ts";
import { binding, instance, withStorage } from "./storage-outage-fixture.ts";

const dockerTest = process.env.RELKIT_TEST_DOCKER === "1" ? test : test.skip;

dockerTest(
  "storage clients reject outages and recover without replacing providers or losing data",
  async () => {
    await withStorage(async (docker, instances, state) => {
      const cacheProvider = createRedisCacheProvider({
        url: binding(state, "cache", "url"),
        cacheId: "outage",
        connectionTimeoutMs: 500,
      });
      const bucketProvider = createS3BucketProvider({
        endpoint: binding(state, "bucket", "endpoint"),
        bucketName: binding(state, "bucket", "bucketName"),
        region: binding(state, "bucket", "region"),
        forcePathStyle: true,
        credentials: {
          accessKeyId: binding(state, "bucket", "accessKeyId"),
          secretAccessKey: binding(state, "bucket", "secretAccessKey"),
        },
      });
      const cache = {
        ...createCacheClient({
          ownerId: "outage",
          cacheId: "outage",
          source: cacheProvider,
          keySchema: z.string(),
          valueSchema: z.string(),
          deadline: () => Date.now() + 3000,
        }),
        ready: cacheProvider.ready,
        close: cacheProvider.close,
      };
      const bucket = createBucketClient({
        ownerId: "outage",
        bucketId: "outage",
        source: bucketProvider,
        deadline: () => Date.now() + 3000,
      });
      try {
        await cache.ready();
        await cache.set("retained", "before");
        await bucket.put("retained", new Uint8Array([1, 2, 3]));
        await bucketOutage(docker, instance(instances, "bucket"), bucket, cache);
        await cacheOutage(docker, instance(instances, "cache"), cache, bucket);
        await cacheOutage(docker, instance(instances, "cache"), cache, bucket);
      } finally {
        await cache.close();
      }
      await expect(cache.ready()).rejects.toThrow("closed");
    });
  },
  120_000,
);

/** Exercises an unavailable bucket while independent cache operations remain available.
 * @param docker - Owned test engine client. @param id - Test bucket container.
 * @param bucket - Provider kept alive throughout the outage. @param cache - Independent healthy provider.
 * @returns Completion after rejected downtime reads/writes and preserved-data recovery. */
async function bucketOutage(
  docker: DockerClient,
  id: string,
  bucket: ReturnType<typeof createBucketClient>,
  cache: ReturnType<typeof createCacheClient>,
) {
  await docker.command(["stop", "--time", "2", id], "Stop test MinIO");
  try {
    await expect(bucket.get("retained")).rejects.toThrow();
    await expect(bucket.put("retained", new Uint8Array([9]))).rejects.toThrow();
    expect(await cache.get("retained")).toBe("before");
  } finally {
    await docker.command(["start", id], "Restart test MinIO");
    await docker.waitForHealthy(id);
  }
  expect(await bucket.get("retained")).toEqual(new Uint8Array([1, 2, 3]));
  await bucket.put("after", new Uint8Array([4]));
  expect(await bucket.get("after")).toEqual(new Uint8Array([4]));
  await bucket.delete("after");
  expect(await bucket.get("after")).toBeUndefined();
}

/** Exercises an unavailable cache with its original live client and preserved Redis data.
 * @param docker - Owned test engine client. @param id - Test Redis container.
 * @param cache - Original cache provider. @param bucket - Independent healthy provider.
 * @returns Completion after native failure, reconnection and successful subsequent writes. */
async function cacheOutage(
  docker: DockerClient,
  id: string,
  cache: ReturnType<typeof createCacheClient>,
  bucket: ReturnType<typeof createBucketClient>,
) {
  await docker.command(["stop", "--time", "2", id], "Stop test Redis");
  try {
    await expect(cache.get("retained")).rejects.toThrow();
    await expect(cache.set("retained", "failed-write")).rejects.toThrow();
    expect(await bucket.get("retained")).toEqual(new Uint8Array([1, 2, 3]));
  } finally {
    await docker.command(["start", id], "Restart test Redis");
    await docker.waitForHealthy(id);
  }
  expect(await Promise.all(Array.from({ length: 4 }, () => cache.get("retained")))).toEqual([
    "before",
    "before",
    "before",
    "before",
  ]);
  await cache.set("after", "recovered");
  expect(await cache.get("after")).toBe("recovered");
  await cache.delete("after");
  expect(await cache.get("after")).toBeUndefined();
}
