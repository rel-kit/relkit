/** A bucket's declared limits hold for a replacement provider the harness wires, as they do in
 * the generated server: a refused upload never reaches the provider, an allowed one does, and a
 * bucket without limits is unchanged.
 */
import { expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GRAPH_VERSION } from "relkit/contracts";
import { buildDependencyClients } from "relkit/engine";
import type { ApplicationGraph, GraphNode, ProviderBindingNode } from "relkit/graph";
import {
  activateTestProviders,
  closeCompatibilityOwners,
  createTestFakes,
  mkdtempSync,
} from "../fixtures/owned-compatibility.ts";
import { copyTestProviderReplacements } from "../../src/provider-replacements.ts";

const source = { file: "src/app.ts", line: 1, column: 1 } as const;
const refused = { code: "RELKIT_BUCKET_POLICY_INVALID" };

interface UploadsClient {
  put(key: string, bytes: Uint8Array, options?: { readonly contentType?: string }): Promise<void>;
  createWriteUrl(
    key: string,
    options?: { readonly contentType?: string; readonly contentLength?: number },
  ): Promise<string>;
}

test("declared bucket limits are enforced before a replacement provider", async () => {
  const calls: string[] = [];
  const provider = {
    capabilities: { signedWriteUrl: true },
    put: async () => void calls.push("put"),
    createWriteUrl: async (key: string) => {
      calls.push("createWriteUrl");
      return `https://storage.example.test/${key}`;
    },
  };
  const fakes = createTestFakes(mkdtempSync(join(tmpdir(), "relkit-bucket-limits-")));
  await activateTestProviders(
    artifacts(),
    copyTestProviderReplacements({ bucket: { media: provider } }),
    undefined,
    fakes,
  );
  try {
    const limited = client(fakes.clients.buckets!, "media.uploads");
    await expect(
      limited.createWriteUrl("a.pdf", { contentType: "application/pdf", contentLength: 10 }),
    ).rejects.toMatchObject(refused);
    await expect(
      limited.put("a.png", new Uint8Array(2000), { contentType: "image/png" }),
    ).rejects.toMatchObject(refused);
    expect(calls).toEqual([]);
    await limited.createWriteUrl("a.png", { contentType: "image/png", contentLength: 10 });
    await limited.put("a.png", new Uint8Array(10), { contentType: "image/png" });
    expect(calls).toEqual(["createWriteUrl", "put"]);

    calls.length = 0;
    const open = client(fakes.clients.buckets!, "media.archive");
    await open.createWriteUrl("a.pdf", { contentType: "application/pdf", contentLength: 10 });
    await open.put("a.pdf", new Uint8Array(2000), { contentType: "application/pdf" });
    expect(calls).toEqual(["createWriteUrl", "put"]);
  } finally {
    await closeCompatibilityOwners();
  }
});

/** Builds a bucket client for a bare reference, as an invocation context does. */
function client(sources: Readonly<Record<string, unknown>>, id: string): UploadsClient {
  const clients = buildDependencyClients({
    ownerId: "media.upload",
    dependencies: { buckets: { uploads: { ref: { kind: "bucket", id } } } },
    sources: { buckets: sources },
  });
  return clients.buckets.uploads as UploadsClient;
}

/** One connected bucket profile shared by a limited and an unlimited bucket. */
function artifacts() {
  const binding: ProviderBindingNode = {
    kind: "provider",
    id: "provider.bucket.media",
    source,
    capability: "bucket",
    profile: "media",
    adapter: {
      integrationId: "s3",
      adapterId: "s3",
      protocolVersion: 1,
      behavior: {},
      connectionContract: {},
      connection: {},
      features: [],
    },
    providerSource: { kind: "connected" },
    namedValues: [],
    deploymentRoles: [],
  };
  const bucket = (id: string, limits: object): GraphNode =>
    ({ kind: "bucket", id, source, profile: "media", visibility: "private", ...limits }) as GraphNode;
  const graph: ApplicationGraph = {
    contractVersion: GRAPH_VERSION,
    appId: "testing-bucket-limits",
    nodes: [
      binding,
      bucket("media.uploads", { allowedContentTypes: ["image/png"], maxObjectBytes: 1000 }),
      bucket("media.archive", {}),
    ],
    edges: [
      { kind: "uses-provider-profile", from: "media.uploads", to: binding.id },
      { kind: "uses-provider-profile", from: "media.archive", to: binding.id },
    ],
  };
  return {
    graph,
    publicFingerprint: "sha256:testing-bucket-limits",
    registry: {} as never,
    runtimeIntegrationModules: [],
  };
}
