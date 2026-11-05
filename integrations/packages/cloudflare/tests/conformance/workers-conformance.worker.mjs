// The Workers conformance Worker: served by `wrangler dev` (workerd) with a local KV namespace
// (CACHE), a local R2 bucket (UPLOADS) and an HTTP Redis endpoint (REDIS_HTTP_URL), it runs the
// cache and bucket checks of the Workers-compatible clients inside the Workers runtime and answers
// with one result per check. `@relkit/redis/runtime` is aliased to the built package by the test's
// wrangler configuration.
import { strict as assert } from "node:assert";
import { createRedisCacheProvider, createRedisClient } from "@relkit/redis/runtime";
import { detectRuntime } from "relkit/runtime";
import {
  createCloudflareKvBindingCacheProvider,
  createCloudflareR2BindingBucketProvider,
  createDurableObjectRealtimeProvider,
} from "../../dist/runtime/index.js";
import { checkRealtime } from "../../../redis/tests/conformance/realtime-checks.mjs";
import {
  checkRedisCache,
  checkRedisProtocol,
} from "../../../redis/tests/conformance/redis-cache-checks.mjs";
import { checkKvCache, checkR2Bucket } from "./binding-checks.mjs";

// The Durable Object class the realtime provider's namespace binding names.
export { RelkitRealtimeState } from "../../dist/workers/index.js";

export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname === "/ready") return new Response("ready");
    // The generated Workers entry stores `env` here; providers read their bindings from it.
    globalThis[Symbol.for("relkit.workers.bindings")] = env;
    const prefix = `workers-${crypto.randomUUID()}`;
    const results = [];
    const run = async (name, check) => {
      try {
        await check();
        results.push({ name, ok: true });
      } catch (error) {
        results.push({ name, ok: false, error: String(error?.stack ?? error) });
      }
    };
    const redis = { createRedisClient, createRedisCacheProvider };
    const url = env.REDIS_HTTP_URL;
    await run("runtime is workers", () => assert.equal(detectRuntime(), "workers"));
    await run("redis over HTTP: protocol", () =>
      checkRedisProtocol(redis, { url, prefix, unreachable: "http://127.0.0.1:1" }),
    );
    await run("redis over HTTP: cache", () => checkRedisCache(redis, { url, prefix }));
    await run("redis socket URL is refused on Workers", () =>
      assert.throws(
        () => createRedisClient({ url: "redis://127.0.0.1:6379" }),
        /cannot open a Redis socket/,
      ),
    );
    await run("KV binding: cache", () =>
      checkKvCache(createCloudflareKvBindingCacheProvider({ binding: "CACHE", cacheId: prefix })),
    );
    await run("R2 binding: bucket", () =>
      checkR2Bucket(createCloudflareR2BindingBucketProvider({ binding: "UPLOADS" }), prefix),
    );
    await run("Durable Object realtime: two providers share one channel", async () => {
      const profile = `${prefix}-realtime`;
      const [reader, writer] = [
        createDurableObjectRealtimeProvider({ binding: "RELKIT_REALTIME", profile }),
        createDurableObjectRealtimeProvider({ binding: "RELKIT_REALTIME", profile }),
      ];
      await Promise.all([reader.ready(), writer.ready()]);
      await checkRealtime(reader, writer, profile, "workers-conformance");
      assert.equal(reader.capabilities.durability, "durable-object");
    });
    await run("missing binding names itself", () =>
      assert.rejects(
        createCloudflareKvBindingCacheProvider({ binding: "MISSING", cacheId: prefix }).get("k"),
        /no binding named MISSING/,
      ),
    );
    return Response.json({ runtime: navigator.userAgent, results });
  },
};
