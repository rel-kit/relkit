import { createHash } from "node:crypto";
import type { LocalServiceRecipeOutputContext } from "@relkit/local-service";
import { INNGEST_LOCAL_STARTUP_TIMEOUT_MS } from "./local-timeouts.js";

export async function waitForInngestReadiness(
  context: LocalServiceRecipeOutputContext,
): Promise<void> {
  const fetcher = context.fetch ?? globalThis.fetch;
  const apiPort = number(context.ports.api, "Inngest API port");
  const workerPort = context.ports["worker.api"];
  await waitForNativeRead(
    fetcher,
    "http://127.0.0.1:" + apiPort,
    text(context.secrets.signingKey, "Inngest signing key"),
    context.signal,
  );
  if (workerPort !== undefined) {
    await waitForHealth(
      fetcher,
      "http://127.0.0.1:" + number(workerPort, "Inngest worker port") + "/_relkit/v1/health/ready",
      context.signal,
    );
    await waitForHealth(fetcher, "http://127.0.0.1:" + apiPort + "/health", context.signal);
  }
}

async function waitForHealth(
  fetcher: typeof globalThis.fetch,
  endpoint: string,
  signal: AbortSignal | undefined,
): Promise<void> {
  const deadline = Date.now() + INNGEST_LOCAL_STARTUP_TIMEOUT_MS;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const response = await fetcher(endpoint, {
        redirect: "error",
        ...(signal === undefined ? {} : { signal }),
      });
      if (response.ok) return;
      lastError = new Error("status " + response.status);
    } catch (error) {
      lastError = error;
    }
    await pause(signal);
  }
  throw new Error(
    "Inngest local health check timed out at " + endpoint + ": " + String(lastError ?? "not ready"),
  );
}

async function waitForNativeRead(
  fetcher: typeof globalThis.fetch,
  baseUrl: string,
  signingKey: string,
  signal: AbortSignal | undefined,
): Promise<void> {
  const deadline = Date.now() + INNGEST_LOCAL_STARTUP_TIMEOUT_MS;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const response = await fetcher(baseUrl + "/v2/runs?limit=1", {
        headers: {
          accept: "application/json",
          authorization: "Bearer " + hashSigningKey(signingKey),
        },
        redirect: "error",
        ...(signal === undefined ? {} : { signal }),
      });
      if (response.ok) return;
      lastError = new Error("status " + response.status);
    } catch (error) {
      lastError = error;
    }
    await pause(signal);
  }
  throw new Error(
    "Inngest native read check timed out at " + baseUrl + ": " + String(lastError ?? "not ready"),
  );
}

function pause(signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    };
    const abort = () => {
      cleanup();
      reject(signal?.reason ?? new Error("Inngest local health check was cancelled."));
    };
    timer = setTimeout(() => {
      cleanup();
      resolve();
    }, 250);
    if (signal === undefined) return;
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
}

function number(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 65_535) {
    throw new TypeError(name + " is invalid");
  }
  return value;
}

function hashSigningKey(signingKey: string): string {
  const prefix = signingKey.match(/^signkey-[\w]+-/u)?.[0] ?? "";
  const key = signingKey.slice(prefix.length).replace(/[^a-z0-9]/giu, "");
  const normalized = key.length % 2 === 0 ? key : "0" + key;
  return prefix + createHash("sha256").update(Buffer.from(normalized, "hex")).digest("hex");
}

function text(value: unknown, name: string): string {
  if (typeof value !== "string" || value === "") throw new TypeError(name + " is invalid");
  return value;
}
