/**
 * Emits common shutdown wiring plus graph-selected resource release. The typed
 * runtime host owns joined drains/scopes/deadlines; this emitter acquires nothing.
 */

/**
 * Includes only lifecycle resources actually registered by the generated host.
 * @param agentRelease - Pure graph-selected agent release statement, or empty.
 * @returns Generated shutdown handlers with existing telemetry and server cleanup.
 */
export function serverShutdownSource(agentRelease: string): string {
  return `
function flushTelemetry() {
  const flush = globalThis["__relkit_flush_telemetry"];
  return typeof flush === "function" ? Promise.resolve(flush()) : Promise.resolve();
}

async function releaseRuntime() {
  await runtimeOwner.shutdown(async () => {
    spanRuntime.close();
    ${agentRelease}
  }, async () => {
    await runtimeOwner.cleanup("telemetry.flush", flushTelemetry);
  });
}

/** Releases an embedded handle's providers without stopping the process. */
async function closeEmbedded() {
  closeEmbedded.done ??= releaseRuntime();
  await closeEmbedded.done;
}

async function shutdown() {
  await releaseRuntime();
  await server.stop(true);
  process.exit(0);
}

// The function host owns the instance lifecycle: no signal handlers, and the handle is returned.
if (relkitMode.functionHost === true) return { fetch: relkitFetch, ready: (budgetMs = 25_000) => awaitFunctionHostReady(Date.now() + budgetMs), drain: drainFunctionHost, close: closeEmbedded };
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
`;
}
