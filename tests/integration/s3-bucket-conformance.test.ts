/**
 * The S3 bucket provider passes the shared bucket conformance suite against a real MinIO, started
 * through the local service reconciler and the S3 integration's own MinIO recipe. MinIO itself
 * must reject an upload whose content type or length differs from what a signed URL was issued
 * for. Opt in with `RELKIT_TEST_DOCKER=1`; the container and volume are removed afterwards.
 */
import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBucketsConformanceHarness } from "../../packages/testing/src/buckets-conformance.ts";
import { runConformance } from "../../packages/testing/src/conformance.ts";
import {
  createDockerClient,
  createDockerMaterializer,
} from "../../integrations/packages/docker/src/runtime/index.ts";
import {
  createLocalProjectIdentity,
  createLocalServiceReconciler,
  localProjectLabels,
  readProviderOverrides,
} from "../../integrations/packages/local/src/runtime/index.ts";
import { localRecipe as s3Recipe } from "../../integrations/packages/s3/src/local-recipe/index.ts";
import {
  createS3BucketProvider,
  type S3BucketOptions,
} from "../../integrations/packages/s3/src/runtime/index.ts";
import { LOCAL_SERVICE_PLAN_VERSION, type ProviderOverrideState } from "relkit/local-service";

const dockerTest = process.env.RELKIT_TEST_DOCKER === "1" ? test : test.skip;
const planHash = `sha256:${"c".repeat(64)}`;
const bindingId = "provider.bucket.uploads";

dockerTest("the S3 provider passes bucket conformance on MinIO", { timeout: 300_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-s3-conformance-"));
  const identity = createLocalProjectIdentity(root, "s3-bucket-conformance");
  const labels = localProjectLabels(identity);
  const docker = createDockerClient({ commandTimeoutMs: 120_000 });
  const materializer = createDockerMaterializer({ client: docker });
  const owner = createLocalServiceReconciler({ identity, materializer });
  try {
    await owner.reconcile({
      plan: {
        version: LOCAL_SERVICE_PLAN_VERSION,
        graphHash: `sha256:${"d".repeat(64)}`,
        services: [
          {
            bindingId,
            capability: "bucket",
            profile: "uploads",
            materializerId: "docker",
            recipe: { integrationId: "s3", recipeId: "minio-docker", recipeVersion: 1 },
            configuration: {},
            requiredBy: ["conformance.uploads"],
          },
        ],
      },
      planHash,
      recipes: { s3: s3Recipe },
      scope: "all",
    });
    const state = readProviderOverrides(identity, planHash);
    if (state === undefined) throw new Error("Provider overrides were not written.");
    const connection = minioConnection(state);
    const report = await runConformance(
      createBucketsConformanceHarness({
        create: () => createS3BucketProvider(connection),
        limited: (_prefix, policy) => createS3BucketProvider({ ...connection, ...policy }),
        failing: () => createS3BucketProvider({ ...connection, endpoint: "http://127.0.0.1:9" }),
      }),
    );
    const outcomes = Object.fromEntries(report.results.map((item) => [item.id, item.outcome]));
    console.log(JSON.stringify(outcomes));
    expect(report.results.filter((result) => result.outcome === "fail")).toEqual([]);
    expect(outcomes.policy).toBe("pass");
    expect(outcomes["signed-upload-limits"]).toBe("pass");

    // MinIO's own answers, for the record: a URL bound to image/png and 4 bytes.
    const provider = createS3BucketProvider(connection);
    const url = await provider.createWriteUrl!("probe/upload.png", undefined, {
      contentType: "image/png",
      contentLength: 4,
    });
    const put = async (type: string, size: number) => {
      const response = await fetch(url, {
        method: "PUT",
        headers: { "content-type": type },
        body: new Uint8Array(size),
      });
      return { status: response.status, body: (await response.text()).slice(0, 200) };
    };
    const wrongType = await put("application/x-msdownload", 4);
    const wrongLength = await put("image/png", 5);
    const declared = await put("image/png", 4);
    console.log(JSON.stringify({ wrongType, wrongLength, declared }));
    expect(wrongType.status).toBe(403);
    expect(wrongLength.status).toBeGreaterThanOrEqual(400);
    expect(declared.status).toBe(200);
    expect((await provider.head!("probe/upload.png"))?.contentType).toBe("image/png");
  } finally {
    await owner.close().catch(() => undefined);
    const containers = await docker.containers(labels).catch(() => []);
    await Promise.all(containers.map((item) => materializer.remove(item.id).catch(() => {})));
    await materializer.removeVolumes(labels).catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
});

/** Reads the MinIO connection the reconciler published for the bucket binding. */
function minioConnection(state: ProviderOverrideState): S3BucketOptions {
  const value = (field: string): string => {
    const found = state.bindings.find((binding) => binding.bindingId === bindingId)?.values[field];
    if (typeof found !== "string" || found === "") throw new Error(`Missing ${field}.`);
    return found;
  };
  return {
    endpoint: value("endpoint"),
    bucketName: value("bucketName"),
    region: value("region"),
    credentials: { accessKeyId: value("accessKeyId"), secretAccessKey: value("secretAccessKey") },
    forcePathStyle: true,
  };
}
