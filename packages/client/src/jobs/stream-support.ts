import type { NamedStreamFrame } from "@relkit/contracts/jobs";
/**
 * Combines every existing named-content generation boundary into its continuity key.
 * @param frame - Original observation frame.
 * @returns The complete named-content continuity key.
 */
export function streamIdentity(frame: NamedStreamFrame): string {
  return [frame.runId, frame.name, frame.attempt, frame.generation, frame.schemaVersion].join(
    "\u0000",
  );
}

/**
 * Validates the existing selective named-content frame and chunk authority.
 * @param value - Original input or payload; its identity is retained where required.
 * @returns The checked original named-content frame.
 */
export function validateFrame(value: unknown): NamedStreamFrame {
  const kind = (value as { readonly kind?: unknown } | null)?.kind;
  if (
    value === null ||
    typeof value !== "object" ||
    typeof (value as { readonly kind?: unknown }).kind !== "string" ||
    typeof (value as { readonly runId?: unknown }).runId !== "string" ||
    typeof (value as { readonly name?: unknown }).name !== "string" ||
    typeof (value as { readonly attempt?: unknown }).attempt !== "number" ||
    !Number.isSafeInteger((value as { readonly attempt?: unknown }).attempt) ||
    typeof (value as { readonly generation?: unknown }).generation !== "string" ||
    typeof (value as { readonly schemaVersion?: unknown }).schemaVersion !== "string" ||
    (kind !== "start" && kind !== "chunk" && kind !== "reset" && kind !== "end")
  ) {
    throw new TypeError("Job stream returned an invalid named-content frame.");
  }
  if (kind === "chunk") {
    const chunk = value as { readonly sequence?: unknown; readonly item?: unknown };
    if (
      typeof chunk.sequence !== "number" ||
      !Number.isSafeInteger(chunk.sequence) ||
      chunk.sequence < 0 ||
      chunk.item === undefined
    ) {
      throw new TypeError("Job stream returned an invalid content chunk.");
    }
  }
  return value as NamedStreamFrame;
}

/**
 * Measures the existing UTF-8 JSON representation used by content memory limits.
 * @param value - Original input or payload; its identity is retained where required.
 * @returns The UTF-8 JSON byte count.
 */
export function byteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

/**
 * Checks and transfers a native iterable or iterator without cloning its payloads.
 * @param value - Original input or payload; its identity is retained where required.
 * @returns The original iterator or the iterable's native iterator.
 */
export function toAsyncIterator(value: unknown): AsyncIterator<unknown> {
  if (value !== null && (typeof value === "object" || typeof value === "function")) {
    const candidate = value as {
      readonly [Symbol.asyncIterator]?: () => AsyncIterator<unknown>;
      readonly next?: (...args: readonly unknown[]) => Promise<IteratorResult<unknown>>;
    };
    const asyncIterator = candidate[Symbol.asyncIterator];
    if (typeof asyncIterator === "function") return asyncIterator();
    if (typeof candidate.next === "function") return candidate as AsyncIterator<unknown>;
  }
  throw new TypeError("Job stream procedure did not return an async iterator.");
}
