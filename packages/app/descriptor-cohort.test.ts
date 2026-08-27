import "../../tests/contracts/descriptor-cohort.test.ts";
import { describe, expect, test } from "bun:test";
import {
  aiSdk,
  copyProviderTopology,
  defineEnv,
  env,
  external,
  isProviderBinding,
  managed,
  redis,
  s3,
} from "@relkit/app";

describe("composable provider declarations", () => {
  test("keeps protocol bindings value-free", () => {
    const values = defineEnv({
      BUCKET_ENDPOINT: env.url(),
      BUCKET_NAME: env.string(),
      BUCKET_REGION: env.string(),
      BUCKET_ACCESS_KEY_ID: env.secret().optional(),
      BUCKET_SECRET_ACCESS_KEY: env.secret().optional(),
      CACHE_URL: env.secret(),
    });
    const bucket = external(
      s3({
        endpoint: values.BUCKET_ENDPOINT,
        bucketName: values.BUCKET_NAME,
        region: values.BUCKET_REGION,
        credentials: {
          accessKeyId: values.BUCKET_ACCESS_KEY_ID,
          secretAccessKey: values.BUCKET_SECRET_ACCESS_KEY,
        },
        forcePathStyle: true,
      }),
    );
    const topology = copyProviderTopology({
      buckets: { default: bucket },
      cache: { default: external(redis({ url: values.CACHE_URL })) },
    });

    expect(isProviderBinding(bucket)).toBe(true);
    expect(bucket.ownership).toBe("external");
    expect(bucket.adapter.adapter).toBe("s3");
    expect(bucket.adapter.environment.map(({ name }) => name)).toEqual([
      "BUCKET_ACCESS_KEY_ID",
      "BUCKET_ENDPOINT",
      "BUCKET_NAME",
      "BUCKET_REGION",
      "BUCKET_SECRET_ACCESS_KEY",
    ]);
    expect(JSON.stringify(topology)).not.toContain("resolved-secret");
    expect(Object.isFrozen(topology)).toBe(true);
  });

  test("requires secret references for credential-bearing fields", () => {
    const values = defineEnv({
      PUBLIC_KEY: env.string(),
      SECRET_KEY: env.secret(),
    });
    expect(() =>
      s3({
        endpoint: "https://example.test",
        bucketName: "assets",
        region: "auto",
        credentials: { accessKeyId: values.PUBLIC_KEY },
      }),
    ).toThrow("s3.credentials.accessKeyId must be a secret environment reference");
    expect(() => redis({ url: values.PUBLIC_KEY })).toThrow(
      "redis.url must be a secret environment reference",
    );
    expect(() =>
      aiSdk({
        defaultProvider: "openai",
        defaultModel: "gpt-5-mini",
        openai: { apiKey: "literal-secret" },
      }),
    ).toThrow("ai-sdk.openai.apiKey must use a secret environment reference");
    expect(
      managed(
        aiSdk({
          defaultProvider: "openai",
          defaultModel: "gpt-5-mini",
          openai: { apiKey: values.SECRET_KEY },
        }),
      ).ownership,
    ).toBe("managed");
  });

  test("rejects capability mismatches and environment branches", () => {
    const values = defineEnv({ CACHE_URL: env.secret() });
    const cache = external(redis({ url: values.CACHE_URL }));

    expect(() => copyProviderTopology({ buckets: { default: cache } })).toThrow(
      'Invalid buckets provider binding "default"',
    );
    expect(() => copyProviderTopology({ development: {} })).toThrow(
      'Unknown provider capability "development"',
    );
  });
});
