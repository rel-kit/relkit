export interface R2Credentials {
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
}

export type R2RequestInit = Omit<RequestInit, "body"> & {
  readonly body?: string | Uint8Array | null;
};

export async function signedR2Request(
  url: string,
  credentials: R2Credentials,
  init: R2RequestInit = {},
  fetcher: typeof globalThis.fetch = globalThis.fetch,
): Promise<Response> {
  const headers = new Headers(init.headers);
  const body = init.body ?? "";
  await signHeaders(url, credentials, headers, body, init.method);
  const { body: requestBody, ...request } = init;
  return fetcher(url, {
    ...request,
    ...(requestBody === undefined ? {} : { body: requestBody as RequestInit["body"] }),
    headers,
  });
}

export async function presignR2Url(
  url: string,
  method: "GET" | "PUT",
  credentials: R2Credentials,
  expiresSeconds: number,
): Promise<string> {
  const amzDate = timestamp(new Date());
  const date = amzDate.slice(0, 8);
  const scope = `${date}/auto/s3/aws4_request`;
  const parsed = new URL(url);
  parsed.searchParams.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256");
  parsed.searchParams.set("X-Amz-Content-Sha256", "UNSIGNED-PAYLOAD");
  parsed.searchParams.set("X-Amz-Credential", `${credentials.accessKeyId}/${scope}`);
  parsed.searchParams.set("X-Amz-Date", amzDate);
  parsed.searchParams.set("X-Amz-Expires", String(expiresSeconds));
  parsed.searchParams.set("X-Amz-SignedHeaders", "host");
  const canonical = [
    method,
    parsed.pathname || "/",
    canonicalQuery(parsed.searchParams),
    `host:${parsed.host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${await hash(canonical)}`;
  const key = await deriveKey(credentials.secretAccessKey, date);
  parsed.searchParams.set("X-Amz-Signature", hex(await hmac(key, stringToSign)));
  return parsed.toString();
}

export async function assertR2Response(response: Response, operation: string): Promise<Response> {
  if (response.ok) return response;
  const body = (await response.text()).trim();
  const code = xmlValue(body, "Code");
  const message = xmlValue(body, "Message");
  const detail = (code || message ? [code, message].filter(Boolean).join(": ") : body).slice(
    0,
    500,
  );
  throw new Error(
    `${operation} failed with status ${response.status}${detail ? `: ${detail}` : ""}`,
  );
}

async function signHeaders(
  url: string,
  credentials: R2Credentials,
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
  const scope = `${date}/auto/s3/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${await hash(canonical)}`;
  const key = await deriveKey(credentials.secretAccessKey, date);
  const signature = hex(await hmac(key, stringToSign));
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

async function deriveKey(secret: string, date: string): Promise<ArrayBuffer> {
  let value = await hmac(`AWS4${secret}`, date);
  value = await hmac(value, "auto");
  value = await hmac(value, "s3");
  return hmac(value, "aws4_request");
}

async function hmac(keyValue: string | ArrayBuffer, value: string): Promise<ArrayBuffer> {
  const bytes = typeof keyValue === "string" ? new TextEncoder().encode(keyValue) : keyValue;
  const key = await crypto.subtle.importKey(
    "raw",
    bytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
}

async function hash(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  return hex(await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes)));
}

function hex(value: ArrayBuffer): string {
  return [...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function xmlValue(xml: string, name: string): string | undefined {
  return new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`).exec(xml)?.[1];
}
