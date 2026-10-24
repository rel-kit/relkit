/** Supplies the retained product-runtime HTTP, SSE timeout, and bounded polling helpers. */
import { Schema } from "effect";

const generation = Schema.fromJsonString(Schema.Struct({ generationId: Schema.String }));
export const requestDetailSchema = Schema.Struct({
  request: Schema.Struct({
    requestId: Schema.String,
    functionId: Schema.optionalKey(Schema.String),
  }),
  spans: Schema.Array(
    Schema.Struct({ functionId: Schema.optionalKey(Schema.String), status: Schema.String }),
  ),
});
const pageSchema = Schema.fromJsonString(
  Schema.Struct({
    items: Schema.Array(Schema.Record(Schema.String, Schema.Json)),
    nextCursor: Schema.optionalKey(Schema.String),
  }),
);

/** Invokes a function against the emitted runtime generation with a fresh idempotency key. */
export async function invoke(
  base: string,
  graphHash: string,
  functionId: string,
  input: Schema.Json,
) {
  const observed = Schema.decodeUnknownSync(generation)(
    await (await fetch(`${base}/_relkit/v1/graph`)).text(),
  );
  return fetch(`${base}/_relkit/v1/actions/functions/${functionId}/invoke`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": crypto.randomUUID(),
      origin: new URL(base).origin,
      "x-relkit-generation-id": observed.generationId,
    },
    body: JSON.stringify({ generationId: observed.generationId, graphHash, input }),
  });
}

/** Reads an observability page using the existing untrusted JSON fixture boundary. */
export async function page(base: string, path: string) {
  return Schema.decodeUnknownSync(pageSchema)(
    await (await fetch(`${base}/_relkit/v1${path}`)).text(),
  );
}

/** Collects the first SSE event within the existing two-second timeout. */
export async function readChunk(response: Response): Promise<string> {
  const reader = response.body!.getReader();
  const timeout = Bun.sleep(2_000).then<never>(() => {
    throw new Error("SSE timeout");
  });
  const decoder = new TextDecoder();
  let text = "";
  while (!text.includes("event:")) {
    const result = await Promise.race([reader.read(), timeout]);
    if (result.done) break;
    text += decoder.decode(result.value, { stream: true });
  }
  return text;
}

/** Polls the retained predicate at most thirty times with fifty-millisecond intervals. */
export async function eventually(check: () => Promise<boolean>): Promise<boolean> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await check()) return true;
    await Bun.sleep(50);
  }
  return false;
}
