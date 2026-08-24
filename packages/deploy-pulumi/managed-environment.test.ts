import { expect, test } from "bun:test";
import type { DeploymentPlan } from "@zsys/deploy";
import { withoutManagedCredentials } from "./src/aws-program-environment.ts";

test("managed bindings remove pipeline credentials in favor of workload identity", () => {
  const plan = {
    providerBindings: [
      {
        id: "provider.buckets.default",
        capability: "buckets",
        profile: "default",
        adapter: "s3",
        ownership: "managed",
        configuration: {
          endpoint: { kind: "env-ref", name: "BUCKET_ENDPOINT", type: "url", sensitive: false },
          credentials: {
            accessKeyId: {
              kind: "env-ref",
              name: "BUCKET_ACCESS_KEY_ID",
              type: "secret-string",
              sensitive: true,
            },
            secretAccessKey: {
              kind: "env-ref",
              name: "BUCKET_SECRET_ACCESS_KEY",
              type: "secret-string",
              sensitive: true,
            },
          },
        },
        environment: [],
      },
    ],
  } as unknown as DeploymentPlan;

  expect(
    withoutManagedCredentials(plan, {
      BUCKET_ENDPOINT: "pipeline-endpoint",
      BUCKET_ACCESS_KEY_ID: "pipeline-access-key",
      BUCKET_SECRET_ACCESS_KEY: "pipeline-secret-key",
      APPLICATION_VALUE: "preserved",
    }),
  ).toEqual({
    BUCKET_ENDPOINT: "pipeline-endpoint",
    APPLICATION_VALUE: "preserved",
  });
});
