import { createS3BucketProvider } from "../../integrations/packages/s3/src/runtime/index.ts";
import { registerBucketContractSuite, type BucketContractTarget } from "./buckets.ts";

const s3: BucketContractTarget = {
  name: "S3 integration",
  features: { atomicFailureInjection: false, pagination: false },
  create: async () => {
    const server = memoryS3();
    const provider = createS3BucketProvider({
      endpoint: "https://storage.example.test",
      bucketName: "assets",
      region: "us-east-1",
      credentials: {
        accessKeyId: "contract-access-key",
        secretAccessKey: "contract-secret-key",
      },
      forcePathStyle: true,
      fetch: server.fetch,
    });
    return {
      provider,
      capabilities: { signedReadUrl: true, signedWriteUrl: true },
      close: async () => server.close(),
    };
  },
};

registerBucketContractSuite(s3);

type StoredObject = {
  readonly bytes: Uint8Array;
  readonly contentType?: string;
  readonly metadata: Readonly<Record<string, string>>;
};

function memoryS3(): { readonly fetch: typeof fetch; readonly close: () => void } {
  const objects = new Map<string, StoredObject>();
  let closed = false;
  const fetcher = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    if (closed) throw new Error("S3 test service is closed");
    const url = new URL(String(input));
    if (url.searchParams.get("list-type") === "2") {
      const prefix = url.searchParams.get("prefix") ?? "";
      const contents = [...objects.keys()]
        .filter((key) => key.startsWith(prefix))
        .sort()
        .map((key) => `<Contents><Key>${key}</Key></Contents>`)
        .join("");
      return new Response(`<ListBucketResult>${contents}</ListBucketResult>`);
    }
    const key = objectKey(url);
    const method = init?.method ?? "GET";
    if (method === "PUT") {
      const headers = new Headers(init?.headers);
      const metadata: Record<string, string> = {};
      headers.forEach((value, name) => {
        if (name.startsWith("x-amz-meta-")) metadata[name.slice(11)] = value;
      });
      objects.set(key, {
        bytes: await requestBytes(init?.body),
        ...(headers.get("content-type") === null
          ? {}
          : { contentType: headers.get("content-type")! }),
        metadata,
      });
      return new Response(null);
    }
    if (method === "DELETE") {
      objects.delete(key);
      return new Response(null, { status: 204 });
    }
    const object = objects.get(key);
    if (object === undefined) return new Response(null, { status: 404 });
    const headers = objectHeaders(object);
    if (method === "HEAD") return new Response(null, { headers });
    return new Response(Uint8Array.from(object.bytes), { headers });
  };
  return {
    fetch: fetcher as typeof fetch,
    close: () => {
      closed = true;
    },
  };
}

function objectKey(url: URL): string {
  return url.pathname
    .replace(/^\/assets\/?/, "")
    .split("/")
    .map(decodeURIComponent)
    .join("/");
}

async function requestBytes(body: BodyInit | null | undefined): Promise<Uint8Array> {
  if (body === undefined || body === null) return new Uint8Array();
  if (body instanceof Uint8Array) return Uint8Array.from(body);
  return new Uint8Array(await new Response(body).arrayBuffer());
}

function objectHeaders(object: StoredObject): Headers {
  const headers = new Headers({
    etag: '"sha256:contract"',
    "content-length": String(object.bytes.byteLength),
    "x-amz-checksum-sha256": "sha256:contract",
  });
  if (object.contentType !== undefined) headers.set("content-type", object.contentType);
  for (const [name, value] of Object.entries(object.metadata))
    headers.set(`x-amz-meta-${name}`, value);
  return headers;
}
