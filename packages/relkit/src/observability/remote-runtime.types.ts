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
}
