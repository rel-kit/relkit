import type { SupervisorTelemetry, SupervisorTelemetryListener } from "./state-machine.types.js";

/** Evidence and borrower snapshot from one atomic activation decision. */
export interface ActivationPublication {
  readonly records: readonly SupervisorTelemetry[];
  readonly listeners: ReadonlySet<SupervisorTelemetryListener>;
}

/** Reentrant callback fanout queue, retaining batches only until synchronous publication. */
export interface ActivationPublicationState {
  readonly publishing: boolean;
  readonly pending: readonly ActivationPublication[];
}
