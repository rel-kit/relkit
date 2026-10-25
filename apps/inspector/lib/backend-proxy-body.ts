/** Rejects oversized control bodies before the Node UI forwards them to its private backend. */
export class InspectorProxyBodyError extends Error {}

/** Streams app uploads to their route limits; control bodies remain bounded before forwarding. */
export async function readInspectorProxyBody(
  request: Request,
): Promise<Uint8Array | ReadableStream<Uint8Array> | undefined> {
  if (request.body === null) return undefined;
  if (!/^\/_relkit\/backend\/(?:_relkit\/v1|rpc)(\/|$)/.test(new URL(request.url).pathname))
    return request.body;
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > 1_048_576))
    throw new InspectorProxyBodyError("Request body exceeds one MiB");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 1_048_576) throw new InspectorProxyBodyError("Request body exceeds one MiB");
      chunks.push(part.value);
    }
    const body = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return body;
  } finally {
    try {
      await reader.cancel();
    } finally {
      reader.releaseLock();
    }
  }
}
