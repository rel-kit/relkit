/**
 * Bucket policy cases of the shared bucket conformance suite: a provider created with a bucket's
 * limits refuses objects and signed uploads the limits do not allow, and a signed upload URL
 * binds the declared content type and length so the storage service rejects any other.
 */
import type { BucketPolicy, BucketWriteUrlOptions } from "relkit/buckets";
import type { BucketsConformanceProvider } from "./buckets-conformance.types.js";
import { check, rejects, SKIPPED } from "./conformance.js";

/** The limits the policy cases create their provider with. */
export const CONFORMANCE_POLICY: Readonly<Required<BucketPolicy>> = Object.freeze({
  maxObjectBytes: 16,
  allowedContentTypes: Object.freeze(["image/png", "text/*"]),
});

const encoder = new TextEncoder();
const bytes = (size: number): Uint8Array => encoder.encode("x".repeat(size));

/**
 * Rejects with a policy error: a TypeError carrying `RELKIT_BUCKET_POLICY_INVALID`.
 * @param operation - The call that must be refused.
 * @param label - What is checked.
 */
async function refused(operation: () => unknown, label: string): Promise<void> {
  let error: unknown;
  await rejects(async () => {
    try {
      return await operation();
    } catch (cause) {
      error = cause;
      throw cause;
    }
  }, label);
  const code = (error as { readonly code?: unknown } | undefined)?.code;
  check(code === "RELKIT_BUCKET_POLICY_INVALID", `${label} fails with the policy error`, error);
}

/**
 * `put` applies the bucket's size limit and content-type allow-list.
 * @param provider - Provider created with {@link CONFORMANCE_POLICY}.
 * @param prefix - Key prefix of the case.
 */
export async function policyCase(
  provider: BucketsConformanceProvider,
  prefix: string,
): Promise<void> {
  const put = provider.put!.bind(provider);
  const key = `${prefix}/policy.txt`;
  await refused(
    () => put(key, bytes(17), { contentType: "text/plain" }),
    "an object over the limit",
  );
  await refused(
    () => put(key, bytes(4), { contentType: "application/x-msdownload" }),
    "a content type outside the allow-list",
  );
  await refused(() => put(key, bytes(4)), "an object without a content type");
  check((await provider.exists!(key)) === false, "a refused object is not stored");
  await put(key, bytes(16), { contentType: "text/plain" });
  const head = await provider.head!(key);
  check(head?.contentType === "text/plain", "an allowed object is stored", head);
}

/**
 * A signed upload is refused before signing when its declaration breaks the policy, and the
 * issued URL makes the storage service reject an upload with another type or length.
 * @param provider - Provider created with {@link CONFORMANCE_POLICY}.
 * @param prefix - Key prefix of the case.
 * @param upload - Sends a PUT to a signed URL; defaults to the global `fetch`.
 * @returns "skipped" when the provider issues no signed write URLs.
 */
export async function signedUploadCase(
  provider: BucketsConformanceProvider,
  prefix: string,
  upload: typeof globalThis.fetch = globalThis.fetch,
): Promise<void | "skipped"> {
  if (!signsWrites(provider.capabilities) || provider.createWriteUrl === undefined) return SKIPPED;
  const sign = (key: string, options: BucketWriteUrlOptions) =>
    provider.createWriteUrl!(key, undefined, options);
  const key = `${prefix}/upload.png`;
  await refused(
    () => sign(key, { contentType: "application/x-msdownload" }),
    "a signed upload for a content type outside the allow-list",
  );
  await refused(
    () => sign(key, { contentType: "image/png", contentLength: 17 }),
    "a signed upload over the size limit",
  );
  const url = await sign(key, { contentType: "image/png", contentLength: 4 });
  const send = async (type: string, size: number) => {
    const response = await upload(url, {
      method: "PUT",
      headers: { "content-type": type },
      body: bytes(size),
    });
    await response.arrayBuffer();
    return response;
  };
  const wrongType = await send("application/x-msdownload", 4);
  check(!wrongType.ok, "storage rejects an upload with another content type", wrongType.status);
  const wrongSize = await send("image/png", 5);
  check(!wrongSize.ok, "storage rejects an upload with another length", wrongSize.status);
  check((await provider.exists!(key)) === false, "a rejected upload is not stored");
  const accepted = await send("image/png", 4);
  check(accepted.ok, "storage accepts the declared upload", accepted.status);
  const head = await provider.head!(key);
  check(head?.contentType === "image/png", "the stored object has the declared type", head);
}

/** Reads the signed write capability in either declaration form. */
function signsWrites(value: BucketsConformanceProvider["capabilities"]): boolean {
  return Array.isArray(value)
    ? value.includes("signedWriteUrl")
    : (value as { readonly signedWriteUrl?: boolean } | undefined)?.signedWriteUrl === true;
}
