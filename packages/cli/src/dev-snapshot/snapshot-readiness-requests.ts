/**
 * Holds at most one initial public readiness request so the verified candidate
 * response can become that caller's response after the atomic publish edge.
 */
import type { StartedCandidate } from "@relkit/supervisor";
import type { SnapshotProbeResponse } from "./snapshot-candidate.types.js";

interface PendingReadinessRequest {
  readonly request: Request;
  readonly resolve: (response: Response) => void;
  readonly removeAbort: () => void;
}

interface ClaimedReadinessRequest extends PendingReadinessRequest {
  readonly generationToken: number;
}

interface ReadinessWaiter {
  readonly generationToken: number;
  readonly resolve: (request: Request | undefined) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

/** Session-owned bridge between the stable listener and unpublished candidate proof. */
export class SnapshotReadinessRequests {
  private pending: PendingReadinessRequest | undefined;
  private claimed: ClaimedReadinessRequest | undefined;
  private response: Response | undefined;
  private waiter: ReadinessWaiter | undefined;
  private accepting = true;
  private closed = false;

  constructor(private readonly path: string) {}

  /** Intercepts only the exact safe initial GET while no request is already retained. */
  intercept(request: Request): Promise<Response> | undefined {
    if (this.closed || !this.accepting || this.pending !== undefined || this.claimed !== undefined)
      return undefined;
    const url = new URL(request.url);
    if (request.method !== "GET" || `${url.pathname}${url.search}` !== this.path) return undefined;
    return new Promise<Response>((resolve) => {
      const abort = () => {
        if (this.pending?.request !== request) return;
        this.pending = undefined;
        resolve(new Response(null, { status: 499 }));
      };
      request.signal.addEventListener("abort", abort, { once: true });
      this.pending = {
        request,
        resolve,
        removeAbort: () => request.signal.removeEventListener("abort", abort),
      };
      this.claimWaitingRequest();
    });
  }

  /** Claims a retained request, briefly awaiting the next bounded benchmark poll. */
  claim(candidate: StartedCandidate): Promise<Request | undefined> {
    const request = this.claimPending(candidate.token.generationToken);
    if (request !== undefined || this.closed) return Promise.resolve(request);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (this.waiter?.generationToken !== candidate.token.generationToken) return;
        this.waiter = undefined;
        this.accepting = false;
        resolve(undefined);
      }, 10);
      this.waiter = { generationToken: candidate.token.generationToken, resolve, timer };
    });
  }

  /** Moves an already held listener request into the candidate proof owner. */
  private claimPending(generationToken: number): Request | undefined {
    const pending = this.pending;
    if (pending === undefined) return undefined;
    this.pending = undefined;
    this.claimed = { ...pending, generationToken };
    return pending.request;
  }

  /** Completes a waiting candidate claim when the next exact public request arrives. */
  private claimWaitingRequest(): void {
    const waiter = this.waiter;
    if (waiter === undefined) return;
    const request = this.claimPending(waiter.generationToken);
    if (request === undefined) return;
    this.waiter = undefined;
    clearTimeout(waiter.timer);
    waiter.resolve(request);
  }

  /** Stages a fully consumed and validated response until traffic publication succeeds. */
  stage(candidate: StartedCandidate, result: SnapshotProbeResponse): void {
    if (this.claimed?.generationToken !== candidate.token.generationToken) return;
    this.response = result.response;
  }

  /** Releases the staged response only after the same generation is active. */
  publish(candidate: StartedCandidate): void {
    if (
      this.claimed?.generationToken !== candidate.token.generationToken ||
      this.response === undefined
    )
      return;
    const claimed = this.claimed;
    const response = this.response;
    this.accepting = false;
    this.claimed = undefined;
    this.response = undefined;
    claimed.removeAbort();
    claimed.resolve(response);
  }

  /** Rejects any request still owned by an unpublished or closing session. */
  reject(candidate?: StartedCandidate): void {
    if (
      candidate !== undefined &&
      this.claimed?.generationToken !== candidate.token.generationToken
    )
      return;
    const retained = this.claimed ?? this.pending;
    const waiter = this.waiter;
    this.accepting = false;
    this.claimed = undefined;
    this.pending = undefined;
    this.response = undefined;
    this.waiter = undefined;
    if (waiter !== undefined) {
      clearTimeout(waiter.timer);
      waiter.resolve(undefined);
    }
    retained?.removeAbort();
    retained?.resolve(Response.json({ error: "No active RelKit generation." }, { status: 503 }));
  }

  /** Closes future interception and releases any held caller. */
  close(): void {
    this.closed = true;
    this.accepting = false;
    this.reject();
  }
}
