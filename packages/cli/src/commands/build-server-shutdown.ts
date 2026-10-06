/** Pure framework shutdown wiring; typed helper owns drains, scopes, and deadlines. */
export const SERVER_SHUTDOWN_SOURCE = `
function flushTelemetry() {
  const flush = globalThis["__relkit_flush_telemetry"];
  return typeof flush === "function" ? Promise.resolve(flush()) : Promise.resolve();
}

async function shutdown() {
  await runtimeOwner.shutdown(async () => {
    spanRuntime.close();
    await runtimeOwner.cleanup("agents.release", () => releaseAgentPersistence(Object.values(runtimeManifest.agents ?? {})));
  }, async () => {
    await runtimeOwner.cleanup("telemetry.flush", flushTelemetry);
  });
  await server.stop(true);
  process.exit(0);
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
`;
