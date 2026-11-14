/**
 * A generated server enforces each bucket's declared limits whatever provider backs it. The test
 * evaluates the generated server's runtime and invocation fragments against the real engine, with
 * a registration plan whose bucket nodes carry `maxObjectBytes` and `allowedContentTypes`, and
 * drives both ways the server builds bucket clients: a function invocation declaring a bare
 * reference, and the application handle. The limited bucket refuses a disallowed type or size
 * before any provider call (including the real S3 provider's signing and network fetch); the
 * bucket without limits signs and stores what it is given, as before.
 */
import { describe, expect, test } from "bun:test";
import { createS3BucketProvider } from "../../integrations/packages/s3/src/runtime/index.ts";
import { SERVER_INVOCATION_SOURCE } from "../../packages/cli/src/commands/build-server-invocation.ts";
import { SERVER_RUNTIME_SOURCE } from "../../packages/cli/src/commands/build-server-runtime.ts";
import * as engine from "../../packages/relkit/src/engine/index.ts";
import { readFailureDetail } from "../../packages/relkit/src/invocation/index.ts";
import { z } from "../../packages/relkit/src/schema/index.ts";

const LIMITED = "media.uploads";
const OPEN = "media.archive";

type Operation = (...args: never[]) => unknown;
interface UploadsClient {
  put(key: string, bytes: Uint8Array, options?: { readonly contentType?: string }): Promise<void>;
  createWriteUrl(
    key: string,
    options?: { readonly contentType?: string; readonly contentLength?: number },
  ): Promise<string>;
}
interface GeneratedServer {
  readonly invokeHttp: (request: { functionId: string; input: object }) => Promise<string[]>;
  readonly relkitHandle: () => Promise<{ buckets: Record<string, UploadsClient> }>;
}

/** Wraps every provider operation so the test sees each call that reaches it.
 * @param provider - Provider whose operations are closures.
 * @param calls - Receives the name of each operation called.
 * @returns A provider with the same capabilities and recorded operations.
 */
function recorded<P extends object>(provider: P, calls: string[]): P {
  return Object.fromEntries(
    Object.entries(provider).map(([name, value]) => [
      name,
      typeof value === "function"
        ? (...args: never[]) => (calls.push(name), (value as Operation)(...args))
        : value,
    ]),
  ) as P;
}

/** Providers backing the plan: a stub accepting anything, and the S3 provider with fake keys.
 * @returns Each provider by profile, plus the provider calls and S3 network requests made.
 */
function providers() {
  const calls: string[] = [];
  const requests: string[] = [];
  const stub = {
    capabilities: { signedWriteUrl: true },
    put: async () => undefined,
    createWriteUrl: async (key: string) => `https://stub.example.test/${key}`,
  };
  const s3 = createS3BucketProvider({
    endpoint: "https://storage.example.test",
    bucketName: "uploads",
    region: "us-east-1",
    credentials: { accessKeyId: "fake-access-key", secretAccessKey: "fake-secret-key" },
    forcePathStyle: true,
    fetch: (async (input: string | URL | Request) => {
      requests.push(String(input instanceof Request ? input.url : input));
      return new Response(null, { status: 200 });
    }) as typeof fetch,
  });
  return { calls, requests, byProfile: { stub: recorded(stub, calls), s3: recorded(s3, calls) } };
}

/** Evaluates the generated fragments with the real engine and the given providers.
 * @param profile - Provider profile both buckets are bound to.
 * @param byProfile - Provider value for each profile.
 * @returns The generated `invokeHttp` and `relkitHandle`.
 */
function generatedServer(profile: string, byProfile: Readonly<Record<string, object>>) {
  const node = (id: string, limits: object) => ({
    kind: "bucket",
    id,
    profile,
    visibility: "private",
    ...limits,
  });
  const plan = {
    agents: [],
    caches: [],
    jobs: [],
    events: [],
    buckets: [
      node(LIMITED, { allowedContentTypes: ["image/png"], maxObjectBytes: 1000 }),
      node(OPEN, {}),
    ],
  };
  const target = {
    id: "media.upload",
    input: z.object({}),
    output: z.array(z.string()),
    dependencies: { buckets: { uploads: { ref: { kind: "bucket", id: LIMITED } } } },
    handler: async (_input: object, context: { buckets: { uploads: UploadsClient } }) =>
      attempts(context.buckets.uploads),
  };
  const scope = {
    plan,
    invoke: engine.invoke,
    createRuntimeHandle: engine.createRuntimeHandle,
    bindBucketPolicy: (engine as Record<string, unknown>).bindBucketPolicy,
    sessionPrincipalSource: engine.sessionPrincipalSource,
    providerStartup: Promise.resolve({
      resolve: (_: string, name: string) => ({ value: byProfile[name] }),
    }),
    executableManifest: { targets: { [target.id]: target } },
    runtimeManifest: { services: {}, tasks: {} },
    registry: { get: () => undefined, targets: {} },
    graph: { nodes: [] },
    values: {},
    shutdownController: new AbortController(),
    telemetry: { emit: () => undefined, collect: (record: object) => record },
    runtimeOwner: { track: <T>(work: Promise<T>) => work },
    authRequestStorage: { getStore: () => undefined, run: <T>(_: object, work: () => T) => work() },
    authRuntime: undefined,
    databaseStartup: undefined,
    databaseNode: undefined,
    otherDatabaseStartups: [],
    contextResolver: { resolve: async () => ({}) },
    currentExecutionContext: () => undefined,
    publicTrace: {},
  };
  const source = SERVER_RUNTIME_SOURCE.replaceAll("import.meta.url", '"file:///server/"');
  return new Function(
    ...Object.keys(scope),
    `${source}\n${SERVER_INVOCATION_SOURCE}\nreturn { invokeHttp, relkitHandle };`,
  )(...Object.values(scope)) as GeneratedServer;
}

/** Names why an upload failed. Inside an invocation, every dependency error reaches the handler as
 * a `RELKIT_PROVIDER_FAILURE` that keeps the original error as its private cause.
 * @param error - The rejection.
 * @returns The original error's code.
 */
function errorCode(error: { readonly code?: string }): string {
  const cause = readFailureDetail(error)?.cause as { readonly code?: string } | undefined;
  return cause?.code ?? error.code ?? String(error);
}

/** Requests a PDF upload URL, then stores 2,000 bytes, one after the other.
 * @param client - Bucket client the generated server built.
 * @returns Each attempt's error code, or "ok" when it succeeded.
 */
async function attempts(client: UploadsClient): Promise<string[]> {
  const outcome = (work: () => Promise<unknown>) => work().then(() => "ok", errorCode);
  return [
    await outcome(() =>
      client.createWriteUrl("a.pdf", { contentType: "application/pdf", contentLength: 10 }),
    ),
    await outcome(() => client.put("a.png", new Uint8Array(2000), { contentType: "image/png" })),
  ];
}

const REFUSED = ["RELKIT_BUCKET_POLICY_INVALID", "RELKIT_BUCKET_POLICY_INVALID"];

describe.each(["stub", "s3"])("generated server bucket limits (%s provider)", (profile) => {
  test("a function invocation refuses disallowed uploads before the provider", async () => {
    const { calls, requests, byProfile } = providers();
    const server = generatedServer(profile, byProfile);
    expect(await server.invokeHttp({ functionId: "media.upload", input: {} })).toEqual(REFUSED);
    expect(calls).toEqual([]);
    expect(requests).toEqual([]);
  });

  test("the application handle refuses them too and still accepts allowed uploads", async () => {
    const { calls, requests, byProfile } = providers();
    const uploads = (await generatedServer(profile, byProfile).relkitHandle()).buckets[LIMITED]!;
    expect(await attempts(uploads)).toEqual(REFUSED);
    expect(calls).toEqual([]);
    expect(requests).toEqual([]);
    const url = await uploads.createWriteUrl("a.png", {
      contentType: "image/png",
      contentLength: 10,
    });
    expect(url).toContain("a.png");
    await uploads.put("a.png", new Uint8Array(10), { contentType: "image/png" });
    expect(calls).toEqual(["createWriteUrl", "put"]);
    expect(requests).toHaveLength(profile === "s3" ? 1 : 0);
  });

  test("a bucket without limits signs and stores what it is given, as before", async () => {
    const { calls, requests, byProfile } = providers();
    const archive = (await generatedServer(profile, byProfile).relkitHandle()).buckets[OPEN]!;
    expect(await attempts(archive)).toEqual(["ok", "ok"]);
    expect(calls).toEqual(["createWriteUrl", "put"]);
    expect(requests).toHaveLength(profile === "s3" ? 1 : 0);
  });
});
