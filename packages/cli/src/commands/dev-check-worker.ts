import { checkProject } from "./check.js";
import type { DevCheckRequest, DevCheckResponse } from "./dev-check.types.js";

// This entrypoint is private to dev-check. Each process handles one generation so
// configuration imports and the TypeScript module graph cannot retain stale state.
process.once("message", async (request: DevCheckRequest) => {
  let response: DevCheckResponse;
  try {
    response = { result: await checkProject({ ...request, mode: "development" }) };
  } catch (error) {
    response = { error: error instanceof Error ? error.message : String(error) };
  }
  process.send!(response, (error: Error | null) => {
    // Config imports may leave native handles alive. IPC's callback confirms the
    // result was flushed; exit now and let the parent reap the owned process group.
    process.exit(error ? 1 : 0);
  });
});
