/** Observable lifecycle state used only by the real release-order fixture. */
export interface TelemetryShutdownState {
  readonly order: string[];
  readonly records: string[];
  providerOpen: boolean;
  telemetryOpen: boolean;
}
