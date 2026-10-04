import type { OutputLineOptions } from "./output-lines.types.js";
export type { OutputLineOptions } from "./output-lines.types.js";

/**
 * Frames native child output before redaction without limiting the stream lifetime.
 * @param stream - Owned native stdout/stderr reader.
 * @param emit - Native sink for bounded multiline blocks.
 * @param options - Block budget, retained-byte callback and owned cancellation signal.
 * @returns Completion after reader release and framing timer removal, including pending-read cancellation.
 */
export async function captureOutputLines(
  stream: ReadableStream<Uint8Array>,
  emit: (output: string) => void,
  options: OutputLineOptions = {},
): Promise<void> {
  const limit = options.maxBytes ?? 64 * 1024;
  if (!Number.isSafeInteger(limit) || limit < 1)
    throw new RangeError("Output block limit must be a positive safe integer.");
  const reader = stream.getReader();
  let cancellation: Promise<void> | undefined;
  let failed = false;
  let failure: unknown;
  /** Cancels the owned reader once. @param reason - Native cancellation reason. @returns Actual cancellation settlement. */
  const cancel = (reason: unknown): Promise<void> =>
    (cancellation ??= reader.cancel(reason).catch(() => undefined));
  /** Forwards owner abortion to the native reader. @returns After cancellation starts. */
  const abort = () => {
    void cancel(options.signal?.reason);
  };
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) abort();
  const decoder = new TextDecoder();
  let line = "";
  let lineBytes = 0;
  let overflow = false;
  let block = "";
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** Clears the frame before invoking its borrowed sink. @returns After one bounded emission. */
  const flush = (): void => {
    clearTimeout(timer);
    timer = undefined;
    const output = block;
    block = "";
    if (output !== "") emit(output);
  };
  /** Bounds a completed line and joins adjacent stack lines. @returns After scheduling or emitting its frame. */
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
    timer = setTimeout(() => {
      try {
        flush();
      } catch (error) {
        failed = true;
        failure = error;
        void cancel(error);
      }
    }, 25);
  };
  /** Frames decoded characters without retaining unbounded lines. @param value - Decoded native bytes. @returns After framing. */
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
      if (failed) throw failure;
      if (next.done) break;
      options.retain?.(next.value);
      consume(decoder.decode(next.value, { stream: true }));
    }
  } catch (error) {
    failed = true;
    await cancel(error);
    throw error;
  } finally {
    options.signal?.removeEventListener("abort", abort);
    try {
      if (!failed) {
        consume(decoder.decode());
        if (line.length > 0 || overflow) finishLine();
        flush();
      }
    } catch (error) {
      await cancel(error);
      throw error;
    } finally {
      clearTimeout(timer);
      if (cancellation !== undefined) await cancellation;
      reader.releaseLock();
    }
  }
}
