/** Shows filesystem bucket ownership with a caller-owned directory and explicit cleanup. */
import { createLocalBucketProviderForTest } from "@relkit/providers-local";

/** Writes and reads a local object, then closes the provider without deleting its directory.
 * @param root - Dedicated directory owned by this test/application.
 * @returns The stored bytes, or undefined if an object unexpectedly disappears. */
export async function readLocalObject(root: string): Promise<Uint8Array | undefined> {
  const bucket = createLocalBucketProviderForTest({ root, maxObjectBytes: 1024 });
  try {
    if (!bucket.put || !bucket.get) throw new Error("Bucket must support reads and writes");
    await bucket.put("example.txt", new TextEncoder().encode("Hello, RELKIT!"), {
      contentType: "text/plain",
    });
    return await bucket.get("example.txt");
  } finally {
    await bucket.close();
  }
}
