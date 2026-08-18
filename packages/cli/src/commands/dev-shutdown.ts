import type { DevSession } from "./dev-session.js";

export async function shutdownDev(session: DevSession, reason: unknown): Promise<void> {
  session.markStopping();
  session.log({
    level: "info",
    event: "dev.shutdown.started",
    fields: { message: errorMessage(reason) },
  });
  session.abortController.abort(reason);
  for (const controller of session.controllers) controller.abort(reason);
  await session.proxy.stop().catch(() => undefined);
  const tasks = [
    session.inspectorChild?.stop(),
    session.inspectorChild?.output,
    session.pendingActivations,
    ...[...session.drains.values()].map((drain) => drain.drain()),
  ].filter((task) => task !== undefined);
  await Promise.allSettled(tasks);
  await session.observability.flush().catch(() => undefined);
  session.clearSignals();
  session.resolveShutdownPromise();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
