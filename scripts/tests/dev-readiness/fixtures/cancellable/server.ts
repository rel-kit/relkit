/**
 * Keeps one physical generated-command child alive for cancellation acceptance.
 * The real benchmark owns its process group; signal handling closes the only
 * resource before exit so the fixture exercises graceful joined termination.
 */
const timer = setInterval(() => {}, 1_000);

/** Releases the fixture's timer before physical process exit. */
function stop(): void {
  clearInterval(timer);
}

process.on("SIGTERM", stop);
process.on("SIGINT", stop);
console.log(`FIXTURE_CHILD:${process.pid}`);
