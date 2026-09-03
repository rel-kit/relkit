/** Frames child output before redaction; a stream's lifetime is never byte-limited. */
export async function captureOutputLines(
  stream: ReadableStream<Uint8Array>,
  emit: (output: string) => void,
  options: { readonly maxBytes?: number; readonly retain?: (bytes: Uint8Array) => void } = {},
): Promise<void> {
  const limit = options.maxBytes ?? 64 * 1024;
  if (!Number.isSafeInteger(limit) || limit < 1)
    throw new RangeError("Output block limit must be a positive safe integer.");
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let line = "";
  let lineBytes = 0;
  let overflow = false;
  let block = "";
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = (): void => {
    clearTimeout(timer);
    timer = undefined;
    if (block !== "") emit(block);
    block = "";
  };
  const finishLine = (): void => {
    const value = line.replace(/\r$/, "") + (overflow ? " [output truncated]" : "");
    line = "";
    lineBytes = 0;
    overflow = false;
    if (value.trim() === "") return;
    const continuation = /^\s|^\[cause\]|^Caused by:/.test(value);
    if (!continuation || Buffer.byteLength(block) + Buffer.byteLength(value) + 1 > limit) flush();
    block += `${block === "" ? "" : "\n"}${value}`;
    clearTimeout(timer);
    // ponytail: 25 ms joins nearby stack lines; structured errors provide exact event boundaries.
    timer = setTimeout(flush, 25);
  };
  const consume = (value: string): void => {
    for (const character of value) {
      if (character === "\n") finishLine();
      else {
        const bytes = Buffer.byteLength(character);
        if (!overflow && lineBytes + bytes <= Math.max(0, limit - 19)) {
          line += character;
          lineBytes += bytes;
        } else overflow = true;
      }
    }
  };
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      options.retain?.(next.value);
      consume(decoder.decode(next.value, { stream: true }));
    }
  } finally {
    consume(decoder.decode());
    if (line.length > 0 || overflow) finishLine();
    flush();
    reader.releaseLock();
  }
}
