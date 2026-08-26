export const SERVER_SHUTDOWN_SOURCE = `
function timeoutFrom(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? Math.min(parsed, 30_000) : fallback;
}

function bounded(task, milliseconds) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => { settled = true; resolve(false); }, milliseconds);
    Promise.resolve(task).then(() => {
      if (!settled) { settled = true; clearTimeout(timer); resolve(true); }
    }, () => {
      if (!settled) { settled = true; clearTimeout(timer); resolve(true); }
    });
  });
}

function flushTelemetry() {
  const flush = globalThis["__zsys_flush_telemetry"];
  return typeof flush === "function" ? Promise.resolve(flush()) : Promise.resolve();
}

function flushSentry() {
  const flush = globalThis["__zsys_flush_sentry"];
  return typeof flush === "function" ? Promise.resolve(flush()) : Promise.resolve();
}

async function shutdown() {
  if (stopping) return;
  stopping = true;
  if (jobWorker !== undefined) clearInterval(jobWorker);
  shutdownController.abort(new Error("Runtime is stopping."));
  const drainTimeoutMs = timeoutFrom(process.env.ZSYS_DRAIN_TIMEOUT_MS, 10_000);
  const telemetryTimeoutMs = timeoutFrom(process.env.ZSYS_TELEMETRY_FLUSH_TIMEOUT_MS, 1_000);
  await bounded(Promise.allSettled(activeInvocations), drainTimeoutMs);
  await bounded(flushTelemetry(), telemetryTimeoutMs);
  await bounded(flushSentry(), telemetryTimeoutMs);
  await bounded(providerStartup, drainTimeoutMs);
  if (providers !== undefined) await providers.dispose().catch(() => undefined);
  await bounded(telemetry.close(), telemetryTimeoutMs);
  await server.stop(true);
  process.exit(0);
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
`;
