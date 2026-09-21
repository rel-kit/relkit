/** Startup budget shared by the Docker worker health check and readiness probes. */
export const INNGEST_LOCAL_STARTUP_TIMEOUT_MS = 300_000;
export const INNGEST_LOCAL_HEALTH_INTERVAL_MS = 500;
export const INNGEST_LOCAL_HEALTH_RETRIES = Math.ceil(
  INNGEST_LOCAL_STARTUP_TIMEOUT_MS / INNGEST_LOCAL_HEALTH_INTERVAL_MS,
);
