import type { AwsCredentials } from "./config.js";

export type AwsRequestInit = Omit<RequestInit, "body"> & {
  readonly body?: string | Uint8Array | null;
};

export interface AwsRequestOptions {
  readonly service: string;
  readonly region: string;
  readonly credentials?: AwsCredentials | undefined;
  readonly fetch?: typeof globalThis.fetch | undefined;
  readonly init?: AwsRequestInit | undefined;
}

export async function awsRequest(url: string, options: AwsRequestOptions): Promise<Response> {
  const request = options.init ?? {};
  const headers = new Headers(request.headers);
  const body = request.body ?? "";
  if (options.credentials !== undefined) await sign(url, options, headers, body);
  const fetcher = options.fetch ?? globalThis.fetch;
  const { body: requestBody, ...requestWithoutBody } = request;
  return fetcher(url, {
    ...requestWithoutBody,
    ...(requestBody === undefined ? {} : { body: requestBody as unknown as RequestInit["body"] }),
    headers,
  });
}

export async function assertResponse(response: Response, operation: string): Promise<Response> {
  if (response.ok) return response;
  throw new Error(`AWS ${operation} failed with status ${response.status}`);
}

async function sign(
  url: string,
  options: AwsRequestOptions,
  headers: Headers,
  body: string | Uint8Array,
): Promise<void> {
  const credentials = options.credentials!;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = amzDate.slice(0, 8);
  const parsed = new URL(url);
  const payloadHash = await hash(body);
  headers.set("host", parsed.host);
  headers.set("x-amz-date", amzDate);
  headers.set("x-amz-content-sha256", payloadHash);
  if (credentials.sessionToken !== undefined)
    headers.set("x-amz-security-token", credentials.sessionToken);
  const canonicalHeaders = [...headers.entries()]
    .map(([key, value]) => [key.toLowerCase(), value.trim().replace(/\s+/g, " ")] as const)
    .sort(([left], [right]) => left.localeCompare(right));
  const signedHeaders = canonicalHeaders.map(([key]) => key).join(";");
  const canonical = canonicalHeaders.map(([key, value]) => `${key}:${value}\n`).join("");
  const request = [
    (options.init?.method ?? "GET").toUpperCase(),
    parsed.pathname || "/",
    parsed.search.slice(1),
    canonical,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const scope = `${date}/${options.region}/${options.service}/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${await hash(request)}`;
  const signingKey = await key(credentials.secretAccessKey, date, options.region, options.service);
  const signature = hex(await hmac(signingKey, stringToSign));
  headers.set(
    "authorization",
    `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  );
}

async function key(
  secret: string,
  date: string,
  region: string,
  service: string,
): Promise<ArrayBuffer> {
  let value = await hmac(`AWS4${secret}`, date);
  value = await hmac(value, region);
  value = await hmac(value, service);
  return hmac(value, "aws4_request");
}

async function hmac(keyValue: string | ArrayBuffer, value: string): Promise<ArrayBuffer> {
  const keyData = typeof keyValue === "string" ? new TextEncoder().encode(keyValue) : keyValue;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(value));
}

async function hash(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  return hex(await crypto.subtle.digest("SHA-256", bytes));
}

function hex(value: ArrayBuffer): string {
  return [...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
