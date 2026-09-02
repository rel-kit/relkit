import { expect, test } from "bun:test";
import { parseInfrastructureBindingValues } from "./src/infrastructure-binding-values.ts";

test("parses deterministic deployment connection outputs and rejects malformed values", () => {
  const parsed = parseInfrastructureBindingValues(
    JSON.stringify({
      "provider.cache.default": { url: "rediss://cache.example:6379" },
      "provider.bucket.assets": {
        region: "us-east-1",
        bucketName: "assets",
        endpoint: "https://s3.us-east-1.amazonaws.com",
      },
    }),
  );
  expect(parsed).toEqual({
    "provider.bucket.assets": {
      bucketName: "assets",
      endpoint: "https://s3.us-east-1.amazonaws.com",
      region: "us-east-1",
    },
    "provider.cache.default": { url: "rediss://cache.example:6379" },
  });
  expect(Object.isFrozen(parsed)).toBe(true);
  expect(parseInfrastructureBindingValues(undefined)).toBeUndefined();
  expect(() => parseInfrastructureBindingValues("[]")).toThrow("must be an object");
  expect(() => parseInfrastructureBindingValues('{"../escape":{}}')).toThrow("output");
});
