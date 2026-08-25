export interface S3Credentials {
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly sessionToken?: string;
}

export type SignedRequestInit = Omit<RequestInit, "body"> & {
  readonly body?: string | Uint8Array | null;
};

export interface SignedRequestOptions {
  readonly region: string;
  readonly credentials?: S3Credentials;
  readonly fetch?: typeof globalThis.fetch;
  readonly init?: SignedRequestInit;
}

export async function signedRequest(url: string, options: SignedRequestOptions): Promise<Response> {
  const request = options.init ?? {};
  const headers = new Headers(request.headers);
  const body = request.body ?? "";
  const fetcher = options.fetch ?? globalThis.fetch;
  const credentials = options.credentials ?? (await workloadCredentials(fetcher));
  if (credentials !== undefined)
    await signHeaders(url, options.region, credentials, headers, body, request.method);
  const { body: requestBody, ...withoutBody } = request;
  return fetcher(url, {
    ...withoutBody,
    ...(requestBody === undefined ? {} : { body: requestBody as RequestInit["body"] }),
    headers,
  });
}

export async function presignS3Url(
  url: string,
  method: "GET" | "PUT",
  region: string,
  expiresSeconds: number,
  options: Pick<SignedRequestOptions, "credentials" | "fetch"> = {},
): Promise<string> {
  const fetcher = options.fetch ?? globalThis.fetch;
  const credentials = options.credentials ?? (await workloadCredentials(fetcher));
  if (credentials === undefined) throw new Error("S3 signed URLs require credentials");
  const now = new Date();
  const amzDate = timestamp(now);
  const date = amzDate.slice(0, 8);
  const scope = `${date}/${region}/s3/aws4_request`;
  const parsed = new URL(url);
  parsed.searchParams.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256");
  parsed.searchParams.set("X-Amz-Credential", `${credentials.accessKeyId}/${scope}`);
  parsed.searchParams.set("X-Amz-Date", amzDate);
  parsed.searchParams.set("X-Amz-Expires", String(expiresSeconds));
  parsed.searchParams.set("X-Amz-SignedHeaders", "host");
  if (credentials.sessionToken !== undefined) {
    parsed.searchParams.set("X-Amz-Security-Token", credentials.sessionToken);
  }
  const canonical = [
    method,
    parsed.pathname || "/",
    canonicalQuery(parsed.searchParams),
    `host:${parsed.host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${await hash(canonical)}`;
  const signingKey = await deriveKey(credentials.secretAccessKey, date, region, "s3");
  parsed.searchParams.set("X-Amz-Signature", hex(await hmac(signingKey, stringToSign)));
  return parsed.toString();
}

let cachedCredentials: { readonly value: S3Credentials; readonly expiresAt: number } | undefined;

async function workloadCredentials(
  fetcher: typeof globalThis.fetch,
): Promise<S3Credentials | undefined> {
  const path = process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI;
  if (path === undefined || !path.startsWith("/")) return undefined;
  if (cachedCredentials !== undefined && cachedCredentials.expiresAt > Date.now() + 60_000) {
    return cachedCredentials.value;
  }
  const headers = new Headers();
  const token = process.env.AWS_CONTAINER_AUTHORIZATION_TOKEN;
  if (token !== undefined) headers.set("authorization", token);
  const response = await fetcher(`http://169.254.170.2${path}`, { headers });
  await assertResponse(response, "container credentials");
  const result = (await response.json()) as Record<string, unknown>;
  if (typeof result.AccessKeyId !== "string" || typeof result.SecretAccessKey !== "string") {
    throw new Error("AWS container credentials response is invalid");
  }
  const value = {
    accessKeyId: result.AccessKeyId,
    secretAccessKey: result.SecretAccessKey,
    ...(typeof result.Token === "string" ? { sessionToken: result.Token } : {}),
  };
  const expiration = typeof result.Expiration === "string" ? Date.parse(result.Expiration) : NaN;
  cachedCredentials = {
    value,
    expiresAt: Number.isFinite(expiration) ? expiration : Date.now() + 300_000,
  };
  return value;
}

export async function assertResponse(response: Response, operation: string): Promise<Response> {
  if (response.ok) return response;
  throw new Error(`${operation} failed with status ${response.status}`);
}

async function signHeaders(
  url: string,
  region: string,
  credentials: S3Credentials,
  headers: Headers,
  body: string | Uint8Array,
  method = "GET",
): Promise<void> {
  const amzDate = timestamp(new Date());
  const date = amzDate.slice(0, 8);
  const parsed = new URL(url);
  const payloadHash = await hash(body);
  headers.set("host", parsed.host);
  headers.set("x-amz-date", amzDate);
  headers.set("x-amz-content-sha256", payloadHash);
  if (credentials.sessionToken !== undefined)
    headers.set("x-amz-security-token", credentials.sessionToken);
  const canonicalHeaders = [...headers.entries()]
    .map(([name, value]) => [name.toLowerCase(), value.trim().replace(/\s+/g, " ")] as const)
    .sort(([left], [right]) => left.localeCompare(right));
  const signedHeaders = canonicalHeaders.map(([name]) => name).join(";");
  const canonical = [
    method.toUpperCase(),
    parsed.pathname || "/",
    canonicalQuery(parsed.searchParams),
    canonicalHeaders.map(([name, value]) => `${name}:${value}\n`).join(""),
    signedHeaders,
    payloadHash,
  ].join("\n");
  const scope = `${date}/${region}/s3/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${await hash(canonical)}`;
  const signingKey = await deriveKey(credentials.secretAccessKey, date, region, "s3");
  const signature = hex(await hmac(signingKey, stringToSign));
  headers.set(
    "authorization",
    `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  );
}

function canonicalQuery(params: URLSearchParams): string {
  return [...params.entries()]
    .map(([name, value]) => [encode(name), encode(value)] as const)
    .sort(
      ([aName, aValue], [bName, bValue]) =>
        aName.localeCompare(bName) || aValue.localeCompare(bValue),
    )
    .map(([name, value]) => `${name}=${value}`)
    .join("&");
}

function encode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function timestamp(value: Date): string {
  return value.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

async function deriveKey(
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
  const data = typeof keyValue === "string" ? new TextEncoder().encode(keyValue) : keyValue;
  const key = await crypto.subtle.importKey("raw", data, { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  return crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
}

async function hash(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  return hex(await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes)));
}

function hex(value: ArrayBuffer): string {
  return [...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
