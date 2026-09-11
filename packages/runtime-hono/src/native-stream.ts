export type NativeStreamFormat = "sse" | "text" | "bytes";

export async function nativeStreamResponse(
  source: AsyncIterable<unknown>,
  format: NativeStreamFormat,
): Promise<Response> {
  const iterator = source[Symbol.asyncIterator]();
  const first = await iterator.next();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      if (first.done) {
        complete(controller, format);
        return;
      }
      controller.enqueue(encodeItem(first.value, format));
    },
    async pull(controller) {
      try {
        const item = await iterator.next();
        if (item.done) complete(controller, format);
        else controller.enqueue(encodeItem(item.value, format));
      } catch (error) {
        if (format === "sse") {
          controller.enqueue(
            encodeSse("relkit-error", {
              code: "RELKIT_STREAM_FAILED",
              message: "The stream ended with an application error.",
            }),
          );
          controller.close();
        } else {
          controller.error(error);
        }
      }
    },
    cancel(reason) {
      return iterator.return?.(reason).then(() => undefined);
    },
  });
  return new Response(body, { headers: headers(format) });
}

function complete(
  controller: ReadableStreamDefaultController<Uint8Array>,
  format: NativeStreamFormat,
): void {
  if (format === "sse") controller.enqueue(encodeSse("relkit-complete", { ok: true }));
  controller.close();
}

function encodeItem(value: unknown, format: NativeStreamFormat): Uint8Array {
  if (format === "sse") return encodeSse("relkit-item", value);
  if (format === "text") {
    if (typeof value !== "string") {
      throw new TypeError("Native text streams require string items.");
    }
    return new TextEncoder().encode(value);
  }
  if (!(value instanceof Uint8Array)) {
    throw new TypeError("Native byte streams require Uint8Array items.");
  }
  return value;
}

function encodeSse(event: string, data: unknown): Uint8Array {
  return new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function headers(format: NativeStreamFormat): Readonly<Record<string, string>> {
  return {
    "cache-control": "no-cache, no-transform",
    "content-type":
      format === "sse"
        ? "text/event-stream; charset=UTF-8"
        : format === "text"
          ? "text/plain; charset=UTF-8"
          : "application/octet-stream",
    "x-content-type-options": "nosniff",
  };
}
