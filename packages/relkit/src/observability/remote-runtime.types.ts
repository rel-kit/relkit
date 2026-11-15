/**
 * Remote telemetry endpoint and bearer token used by the remote runtime.
 *
 * @example
 * const remote: RemoteObservabilityOptions = {
 *   url: "https://telemetry.example.test",
 *   token: "secret",
 * };
 */
export interface RemoteObservabilityOptions {
  readonly url: string;
  readonly token: string;
  /** Sends the framework's success logs to the inspection stream too (decision D15: off by default). */
  readonly frameworkSuccessLogs?: boolean;
}
