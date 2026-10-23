/** Checks native worker completion through its durable output and committed journal receipt. */
import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Schema } from "effect";
import { PRODUCTION_PROOF_TOKEN } from "./standalone-process.js";

const RunRecord = Schema.Struct({
  kind: Schema.Literal("native-run"),
  instanceId: Schema.String,
  sequence: Schema.Number,
  data: Schema.Struct({
    runId: Schema.String,
    status: Schema.String,
    output: Schema.optionalKey(Schema.Struct({ doubled: Schema.Number })),
  }),
});
const TriggerReceipt = Schema.Struct({ runId: Schema.String });

/**
 * Submits through normal HTTP and waits for a completed native journal record.
 * @param root - Owned acceptance fixture or relocated application root.
 * @param url - Actual allocated HTTP origin of the owned production server.
 * @returns After selected Scalar rendering and the matching committed durable output are verified.
 */
export async function verifyProductionNativeWorker(root: string, url: string): Promise<void> {
  const reference = await fetch(`${url}/_relkit/v1/api-reference`, {
    headers: { authorization: `Bearer ${PRODUCTION_PROOF_TOKEN}` },
    signal: AbortSignal.timeout(5_000),
  });
  assert.equal(reference.status, 200, await reference.clone().text());
  assert.match(await reference.text(), /scalar/i);
  await verifyProductionTask(url, () =>
    readFile(join(root, ".relkit/state/jobs/default/native/records.ndjson"), "utf8"),
  );
}

/**
 * Requires the submitted run's committed output from its actual native journal.
 * @param url - Real production origin exposing the unchanged probe submission route.
 * @param readRecords - Actual owned file or Docker exec read of the production journal.
 * @returns After the matching durable completion contains the computed output.
 */
export async function verifyProductionTask(
  url: string,
  readRecords: () => Promise<string>,
): Promise<void> {
  const response = await fetch(`${url}/run`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: url },
    body: JSON.stringify({ value: 21 }),
    signal: AbortSignal.timeout(5_000),
  });
  assert.equal(response.status, 200, await response.clone().text());
  const receipt = Schema.decodeUnknownSync(TriggerReceipt)(await response.json());
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const record = completedRun(await readRecords(), receipt.runId);
    if (record !== undefined) {
      assert.deepEqual(record.data.output, { doubled: 42 });
      return;
    }
    await Bun.sleep(25);
  }
  throw new Error("Selected native worker did not commit its output within 10 seconds.");
}

/**
 * Reads only fixture-owned complete durable records; partial appends are retried.
 * @param records - Actual journal bytes read from the native process's owned state.
 * @param runId - Operation receipt run identity whose durable completion must be observed.
 * @returns The matching complete durable run record, or absence while completion is not yet committed.
 */
function completedRun(records: string, runId: string) {
  for (const line of records.split("\n").filter(Boolean)) {
    try {
      const record = Schema.decodeUnknownSync(Schema.fromJsonString(RunRecord))(line);
      if (record.data.runId === runId && record.data.status === "completed") return record;
    } catch {
      // Other durable transitions or an in-progress append do not prove completion.
    }
  }
  return undefined;
}
