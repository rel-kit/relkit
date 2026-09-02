import { describe, expect, test } from "bun:test";
import { createBindingValueRef } from "@relkit/provider";
import { s3 } from "./src/index.ts";
import { localRecipe } from "./src/local-recipe/index.ts";
import { createS3BucketProvider } from "./src/runtime/index.ts";

const credentials = {
  accessKeyId: "test-access-key",
  secretAccessKey: "test-secret-key",
};

describe("S3 integration authoring", () => {
  test("separates connection, behavior, features, and provenance", () => {
    const accessKeyId = createBindingValueRef("S3_ACCESS_KEY_ID", "secret-string");
    const secretAccessKey = createBindingValueRef("S3_SECRET_ACCESS_KEY", "secret-string");
    const adapter = s3({
      endpoint: new URL("https://storage.example.test"),
      bucketName: "assets",
      region: "auto",
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
      signedUrlTtlSeconds: 600,
    });

    expect(adapter).toMatchObject({
      integration: { integrationId: "s3" },
      capability: { id: "bucket" },
      adapterId: "s3",
      connection: {
        endpoint: "https://storage.example.test/",
        bucketName: "assets",
        region: "auto",
        accessKeyId,
        secretAccessKey,
      },
      behavior: { value: { forcePathStyle: true, signedUrlTtlSeconds: 600 } },
      features: [{ id: "signedReadUrl" }, { id: "signedWriteUrl" }],
      localRecipe: { integrationId: "s3", recipeId: "minio-docker", recipeVersion: 1 },
    });
  });

  test("supports deferred behavior and rejects unsafe credentials", () => {
    expect(s3({ signedUrlTtlSeconds: 900 })).toMatchObject({
      connection: {},
      behavior: { value: { forcePathStyle: true, signedUrlTtlSeconds: 900 } },
    });
    expect(() =>
      s3({
        credentials: {
          accessKeyId: createBindingValueRef("ACCESS_KEY", "string") as never,
          secretAccessKey: createBindingValueRef("SECRET_KEY", "secret-string"),
        },
      }),
    ).toThrow("S3 credentials.accessKeyId must be a named secret binding value");
  });
});

test("owns a pinned MinIO recipe with generated credentials and path-style outputs", async () => {
  expect(Object.isFrozen(localRecipe)).toBe(true);
  expect(localRecipe).toMatchObject({
    integrationId: "s3",
    recipeId: "minio-docker",
    image: expect.stringMatching(/^minio\/minio:RELEASE\.[^@]+@sha256:[a-f0-9]{64}$/),
    command: ["server", "/data", "--console-address", ":9001"],
    ports: { api: 9000, console: 9001 },
    volume: { mountPath: "/data" },
    health: { command: expect.arrayContaining(["http://127.0.0.1:9000/minio/health/ready"]) },
    generatedSecrets: { accessKeyId: { bytes: 12 }, secretAccessKey: { bytes: 24 } },
    environment: {
      MINIO_ROOT_USER: { secret: "accessKeyId" },
      MINIO_ROOT_PASSWORD: { secret: "secretAccessKey" },
    },
  });
  const context = {
    ports: { api: 49_154, console: 49_155 },
    secrets: { accessKeyId: "local-access", secretAccessKey: "local-secret" },
  };
  expect(localRecipe.outputs(context)).toEqual({
    endpoint: "http://127.0.0.1:49154",
    bucketName: "relkit",
    region: "us-east-1",
    accessKeyId: "local-access",
    secretAccessKey: "local-secret",
  });
  let request: { url: string; init?: RequestInit } | undefined;
  await localRecipe.initialize({
    ...context,
    fetch: (async (input, init) => {
      request = { url: String(input), init };
      return new Response(null, { status: 200 });
    }) as typeof fetch,
  });
  expect(request?.url).toBe("http://127.0.0.1:49154/relkit");
  expect(request?.init?.method).toBe("PUT");
  expect(new Headers(request?.init?.headers).get("authorization")).toStartWith("AWS4-HMAC-SHA256");
  expect(request?.url).not.toContain("local-secret");
});

describe("S3-compatible runtime", () => {
  for (const variant of [
    { name: "AWS-style", endpoint: "https://s3.us-east-1.amazonaws.com", path: false },
    { name: "R2-style", endpoint: "https://account.r2.cloudflarestorage.com", path: true },
    { name: "MinIO-style", endpoint: "http://127.0.0.1:9000", path: true },
  ]) {
    test(`${variant.name} endpoint signs requests and preserves its addressing mode`, async () => {
      const requests: { url: string; init?: RequestInit }[] = [];
      const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        requests.push({ url, init });
        if (url.includes("list-type=2")) {
          return new Response(
            "<ListBucketResult><Contents><Key>&amp;lt;a&amp;gt;</Key></Contents></ListBucketResult>",
          );
        }
        if (init?.method === "HEAD") {
          return new Response(null, {
            headers: {
              etag: '"etag"',
              "content-length": "3",
              "content-type": "text/plain",
              "x-amz-meta-owner": "relkit",
            },
          });
        }
        return new Response(init?.method === "GET" ? "abc" : null);
      };
      const provider = createS3BucketProvider({
        endpoint: variant.endpoint,
        bucketName: "assets",
        region: variant.name === "R2-style" ? "auto" : "us-east-1",
        credentials,
        forcePathStyle: variant.path,
        fetch: fetcher as typeof fetch,
      });

      await provider.put!("folder/a.txt", new TextEncoder().encode("abc"), {
        contentType: "text/plain",
        metadata: { owner: "relkit" },
      });
      expect(new TextDecoder().decode(await provider.get!("folder/a.txt"))).toBe("abc");
      expect(await provider.head!("folder/a.txt")).toMatchObject({
        etag: "etag",
        size: 3,
        contentType: "text/plain",
        metadata: { owner: "relkit" },
      });
      expect(await provider.list!("folder")).toEqual(["&lt;a&gt;"]);
      const write = requests[0]!;
      expect(new Headers(write.init?.headers).get("authorization")).toStartWith("AWS4-HMAC-SHA256");
      expect(write.url).toContain(variant.path ? "/assets/folder/a.txt" : "assets.");
      expect(await provider.createReadUrl!("folder/a.txt")).toContain("X-Amz-Signature=");
      expect(await provider.createWriteUrl!("folder/a.txt")).toContain("X-Amz-Signature=");
    });
  }

  test("propagates cancellation to fetch", async () => {
    const controller = new AbortController();
    controller.abort(new Error("cancelled"));
    const provider = createS3BucketProvider({
      endpoint: "http://127.0.0.1:9000",
      bucketName: "assets",
      region: "us-east-1",
      credentials,
      forcePathStyle: true,
      fetch: (async (_input, init) => {
        expect(init?.signal?.aborted).toBe(true);
        throw init?.signal?.reason;
      }) as typeof fetch,
    });
    await expect(
      provider.get!("cancelled", { operation: "get", signal: controller.signal }),
    ).rejects.toThrow("cancelled");
  });

  test("includes response code and message in errors", async () => {
    const provider = createS3BucketProvider({
      endpoint: "https://project.storage.example/storage/v1/s3",
      bucketName: "assets",
      region: "eu-central-1",
      credentials,
      forcePathStyle: true,
      fetch: (async () =>
        new Response(
          "<Error><Code>InvalidAccessKeyId</Code><Message>Access key not found</Message></Error>",
          { status: 403 },
        )) as typeof fetch,
    });

    await expect(provider.list!()).rejects.toThrow(
      "S3 list failed with status 403: InvalidAccessKeyId: Access key not found",
    );
  });
});
