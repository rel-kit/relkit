import { API_BASE_PATH } from "@zsys/contracts";
import type { CandidateProbeResponse, CandidateVerificationOptions } from "./verification-types.js";
import { CandidateVerificationError } from "./verification-types.js";

/** Performs one bounded v1 probe without allowing a stalled backend to block activation. */
export async function requestProbe(
  options: CandidateVerificationOptions,
  path: string,
  deadline: number,
): Promise<CandidateProbeResponse | undefined> {
  if (options.signal?.aborted)
    throw options.signal.reason ?? new Error("Verification was aborted.");
  const remaining = deadline - Date.now();
  if (remaining <= 0) return undefined;
  const controller = new AbortController();
  const forwardAbort = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener("abort", forwardAbort, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const fetcher = options.fetch ?? fetch;
  const url = `http://${options.hostname ?? "127.0.0.1"}:${options.candidate.port}${API_BASE_PATH}${path}`;
  const responsePromise: Promise<CandidateProbeResponse | undefined> = fetcher(url, {
    signal: controller.signal,
  })
    .then(async (response): Promise<CandidateProbeResponse | undefined> => {
      const payload: unknown = await response.json();
      if (!isRecord(payload))
        throw new CandidateVerificationError(
          "ZSYS_CANDIDATE_RESPONSE_INVALID",
          "Candidate health response must be a JSON object.",
        );
      return { response, payload };
    })
    .catch((error) => {
      if (error instanceof CandidateVerificationError) throw error;
      return undefined;
    });
  const timeoutPromise = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(undefined);
    }, remaining);
  });
  try {
    return await Promise.race([responsePromise, timeoutPromise]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    options.signal?.removeEventListener("abort", forwardAbort);
    controller.abort();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
