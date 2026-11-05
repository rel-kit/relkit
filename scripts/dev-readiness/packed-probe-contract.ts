/**
 * Derives a packed project's exact expected response before its measured launch: the
 * served OpenAPI document must equal the one the project's creation check generated.
 * The read is one finite native call, outside the command-to-response timer.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { API_BASE_PATH, canonicalJson } from "relkit/contracts";
import { Effect } from "effect";
import { ReadinessBenchmarkError } from "./benchmark-error.js";

/**
 * Selects a real application response the first start must serve.
 * @param root - Installed external project checked before measurement.
 * @param port - Available public backend port selected before the clock starts.
 * @returns Exact URL/status/body; never accepts a Ready banner or health-only response.
 */
export const packedProbeContract = Effect.fn("ReadinessBenchmark.probeContract")(function* (
  root: string,
  port: number,
) {
  const document = yield* Effect.tryPromise({
    try: async () =>
      JSON.parse(await readFile(join(root, ".relkit/generated/openapi.json"), "utf8")) as object,
    catch: (cause) =>
      new ReadinessBenchmarkError({
        operation: "probe.document.decode",
        cause: new Error("Invalid generated OpenAPI document", { cause }),
      }),
  });
  return {
    url: `http://127.0.0.1:${port}${API_BASE_PATH}/openapi.json`,
    expectedStatus: 200,
    expectedBody: canonicalJson(document),
  };
});
