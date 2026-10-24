/** Private IPC ownership state; every pending reply belongs to one child process. */
import type { ChildProcess } from "node:child_process";
import type { Schema } from "effect";

/** One timer-bound IPC reply, settled or rejected when the worker retires. */
export interface PendingWorkerCall {
  readonly resolve: (value: Schema.Json | undefined) => void;
  readonly reject: (error: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

/** Physical process, pending replies, and exactly-once close state. */
export interface WorkerClientState {
  readonly child: ChildProcess;
  readonly pending: Map<number, PendingWorkerCall>;
  readonly onFailure: (error: Error) => void;
  readonly exited: Promise<void>;
  nextId: number;
  closed: boolean;
  closing: boolean;
  opened: boolean;
  failure: Error | undefined;
  diagnostic: string;
  closePromise: Promise<void> | undefined;
}
