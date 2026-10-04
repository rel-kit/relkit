import type { ClientIdentityDocument } from "@relkit/contracts";
import { ManagedRuntime } from "effect";
import { runExecutionSync } from "@relkit/contracts/operation";
import { runClientSync } from "../client-runtime.js";
import { RealtimeSessions, realtimeSessionsLayer } from "./realtime-session.service.js";
import type { RealtimeFrame, RealtimeStatus } from "./realtime-manager.types.js";
export type { RealtimeFrame, RealtimeStatus } from "./realtime-manager.types.js";
export { realtimeSubscriptionKey } from "./realtime-session-key.js";

/** Synchronous external-store adapter over one scoped realtime session owner. */
export class RealtimeManager {
  private readonly owner;
  private readonly service;
  private closing: Promise<void> | undefined;

  /**
   * Acquires state synchronously; connections stay lazy until a channel observer binds.
   * @param client - Borrowed generated client.
   * @param identity - Authorization/session identity fixed for this manager.
   * @returns The owner or public error instance.
   */
  constructor(
    client: unknown,
    identity?: Pick<ClientIdentityDocument, "identityScope" | "sessionEpoch">,
  ) {
    this.owner = ManagedRuntime.make(realtimeSessionsLayer(client, identity));
    this.service = runExecutionSync(this.owner, RealtimeSessions);
  }

  /** Shared sessions owned by this manager, exposed for existing diagnostics. */
  get subscriptions() {
    return this.service.feeds;
  }

  /** Existing external-store listeners, isolated from native consumption. */
  get statusListeners() {
    return this.service.statusListeners;
  }

  /** Current external-store connection state. */
  get status(): RealtimeStatus {
    return runClientSync(this.service.snapshot());
  }

  /**
   * Borrows a shared channel without letting one observer close another's request.
   * @param channel - Declared channel name.
   * @param params - Channel parameters included in the sharing key.
   * @param listener - Synchronous frame observer.
   * @param statusListener - Optional status observer.
   * @returns An idempotent synchronous lease release function.
   */
  subscribe(
    channel: string,
    params: unknown,
    listener: (frame: RealtimeFrame) => void,
    statusListener?: (status: RealtimeStatus) => void,
  ): () => void {
    const release = runExecutionSync(
      this.owner,
      this.service.subscribe(channel, params, listener, statusListener),
    );
    return () => {
      if (this.closing === undefined) runExecutionSync(this.owner, release);
    };
  }

  /**
   * Subscribes to manager status changes for React's synchronous external store.
   * @param listener - Store notification callback.
   * @returns Its synchronous release function.
   */
  listenStatus(listener: () => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  /** Initiates disposal synchronously; close joins native iterator cleanup.
   * @returns Nothing; the existing owned state or publication is updated.
   */
  dispose(): void {
    if (this.closing !== undefined) return;
    runExecutionSync(this.owner, this.service.stop());
    this.closing = this.owner.dispose();
  }

  /**
   * Joins the manager's finalization, including pending native pulls and retries.
   * @returns The memoized completion of disposal.
   */
  close(): Promise<void> {
    this.dispose();
    return this.closing!;
  }
}
