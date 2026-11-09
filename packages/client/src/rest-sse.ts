/** Parses a RelKit SSE stream route: `relkit-item`, `relkit-complete` and `relkit-error` events. */
import { ORPCError } from "@orpc/client";

/** The part of a body reader the parser uses. */
export interface ChunkReader {
  readonly read: () => Promise<{ readonly done: boolean; readonly value?: Uint8Array | undefined }>;
}

/**
 * Reads SSE events from a body reader as stream items.
 * @param reader - Body reader.
 * @returns An iterator over each `relkit-item` payload; it ends at `relkit-complete` or the
 * end of the body, and throws on `relkit-error`.
 * @example for await (const item of { [Symbol.asyncIterator]: () => readSse(reader) }) {}
 */
export function readSse(reader: ChunkReader): AsyncIterator<unknown> {
  const decoder = new TextDecoder();
  let buffer = "";
  let finished = false;
  /** Reads the next complete event block. */
  const nextBlock = async (): Promise<string | undefined> => {
    for (;;) {
      const end = buffer.search(/\r?\n\r?\n/);
      if (end !== -1) {
        const block = buffer.slice(0, end);
        buffer = buffer.slice(end).replace(/^\r?\n\r?\n/, "");
        return block;
      }
      const chunk = await reader.read();
      if (chunk.done || chunk.value === undefined) {
        const rest = buffer.trim();
        buffer = "";
        return rest === "" ? undefined : rest;
      }
      buffer += decoder.decode(chunk.value, { stream: true });
    }
  };
  return {
    async next() {
      while (!finished) {
        const block = await nextBlock();
        if (block === undefined) break;
        const { event, data } = parseEvent(block);
        if (event === "relkit-item") return { done: false, value: data };
        if (event === "relkit-complete") break;
        if (event === "relkit-error") {
          finished = true;
          const record = (data ?? {}) as { readonly code?: unknown; readonly message?: unknown };
          throw new ORPCError("INTERNAL_SERVER_ERROR", {
            status: 500,
            message: typeof record.message === "string" ? record.message : "The stream failed.",
            data: { code: typeof record.code === "string" ? record.code : "RELKIT_STREAM_FAILED" },
          });
        }
      }
      finished = true;
      return { done: true, value: undefined };
    },
  };
}

/**
 * Parses one SSE event block.
 * @param block - Lines of one event.
 * @returns The event name and its JSON data.
 */
function parseEvent(block: string): { readonly event: string; readonly data: unknown } {
  let event = "message";
  const data: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
  }
  const text = data.join("\n");
  try {
    return { event, data: text === "" ? undefined : JSON.parse(text) };
  } catch {
    return { event, data: text };
  }
}
