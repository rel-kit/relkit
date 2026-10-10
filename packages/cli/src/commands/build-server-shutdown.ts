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

async function shutdown() {
  await runtimeOwner.shutdown(async () => {
    spanRuntime.close();
    ${agentRelease}
  }, async () => {
    await runtimeOwner.cleanup("telemetry.flush", flushTelemetry);
  });
  await server.stop(true);
  process.exit(0);
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
`;
}
