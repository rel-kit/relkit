/** Real WAL receipts deduplicate retransmission without suppressing a later span revision. */
import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import type { LocalRecord } from "@relkit/observability/local/record";
import { InspectorHistory } from "../src/history.service.js";
import { InspectorHistoryNativeLive } from "../src/history-native.service.js";

const projectId = `sha256:${"a".repeat(64)}`;
const traceId = "30000000000000000000000000000003";
const startedAt = new Date().toISOString();

function revision(sequence: number): LocalRecord {
  return {
    key: `312b0cb1-81bb-4b99-81b7-5812a720782b:${sequence}`,
    origin: "application",
    record: {
      version: 2,
      signal: "span",
      traceId,
      spanId: "0000000000000001",
      name: "work",
      kind: "internal",
      status: sequence === 1 ? "started" : "completed",
      revision: sequence - 1,
      startedAt,
      generationId: "retired-generation",
    },
  };
}

const verifyReadback = (root: string) =>
  Effect.scoped(
    Effect.gen(function* () {
      const history = yield* InspectorHistory.make(root, projectId);
      expect(yield* history.call({ type: "append", records: [revision(1), revision(2)] })).toEqual(
        [],
      );
      expect(
        yield* history.call({ type: "query", kind: "traces", query: { traceId } }),
      ).toMatchObject({
        items: [
          expect.objectContaining({ generationId: "retired-generation" }),
          expect.objectContaining({ generationId: "retired-generation" }),
        ],
      });
      expect(yield* history.call({ type: "detail", kind: "trace", id: traceId })).toMatchObject({
        spans: [{ revision: 1, status: "completed", generationId: "retired-generation" }],
      });
    }),
  );

test("distinct session sequences retain both revisions and survive lost ACK replay plus restart", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-history-revision-"));
  try {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const history = yield* InspectorHistory.make(root, projectId);
          expect(yield* history.call({ type: "append", records: [revision(1)] })).toHaveLength(1);
          expect(yield* history.call({ type: "append", records: [revision(1)] })).toEqual([]);
          expect(yield* history.call({ type: "append", records: [revision(2)] })).toHaveLength(1);
        }),
      ).pipe(Effect.provide(InspectorHistoryNativeLive)),
    );
    await Effect.runPromise(verifyReadback(root).pipe(Effect.provide(InspectorHistoryNativeLive)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 20_000);
