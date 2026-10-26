/** The count-limited pull never evicts later retained records or exceeds its byte ceiling. */
import { expect, test } from "vitest";
import { Effect, Schema } from "effect";
import { InspectionCapture } from "../src/connection/capture.service.js";

test.each([256, 257])("capture of %s records returns at most 256 per pull", async (count) => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const capture = yield* InspectionCapture.make({});
      for (let i = 0; i < count; i++)
        yield* capture.append({
          version: 2,
          signal: "log",
          timestamp: "2026-10-23T00:00:00.000Z",
          level: "info",
          component: "bounds",
          message: String(i),
          fields: {},
        });
      const response = yield* capture.records(
        new Request("http://localhost/_relkit/bridge/v1/records"),
      );
      const text = yield* Effect.promise(() => response.text());
      expect(Buffer.byteLength(text)).toBeLessThan(1_048_576);
      expect(JSON.parse(text)).toMatchObject({ droppedRecords: 0, incomplete: false });
      expect(JSON.parse(text).records).toHaveLength(256);
      const rest = yield* capture.records(
        new Request("http://localhost/_relkit/bridge/v1/records?after=256"),
      );
      const remainder = yield* Schema.decodeUnknownEffect(
        Schema.Struct({ records: Schema.Array(Schema.Json) }),
      )(yield* Effect.promise(() => rest.json()));
      expect(remainder.records).toHaveLength(count - 256);
    }),
  );
});
