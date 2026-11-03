/** Joins native listener release, including the pinned Bun closed-socket counter defect.
 * @typeParam T - Native WebSocket callback data.
 * @param server - Stable listener already stopped with force enabled.
 * @param stopping - Native stop result.
 * @param sockets - Accepted native sockets not yet acknowledged by close callbacks.
 * @returns After native stop, or verified physical release on affected Bun 1.3.10.
 * @remarks Bun issue #36223 leaves stop pending after server-initiated WebSocket closure.
 * The fallback requires all close acknowledgements, no native requests and an exclusive
 * same-port listener acquisition. Unref follows physical release; no timeout proves cleanup.
 */
export async function joinStoppedProxyListener<T>(
  server: Bun.Server<T>,
  stopping: Promise<void>,
  sockets: ReadonlySet<Bun.ServerWebSocket<T>>,
): Promise<void> {
  void stopping.catch(() => undefined);
  if (
    Bun.version !== "1.3.10" ||
    sockets.size !== 0 ||
    server.pendingRequests !== 0 ||
    server.pendingWebSockets === 0
  ) {
    await stopping;
    return;
  }
  // Native close callbacks and scoped workers have already completed. Prove that
  // this exact listener authority is released before dropping the stale wrapper ref.
  const probe = Bun.serve({
    hostname: server.url.hostname,
    port: server.port!,
    reusePort: false,
    fetch: () => new Response(null, { status: 503 }),
  });
  await probe.stop(true);
  // Dropping Bun's stale wrapper ref is safe after physical release; its stale
  // pendingWebSockets count and stop Promise are explicitly not claimed settled.
  server.unref();
}
