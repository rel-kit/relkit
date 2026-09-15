export interface TriggerDeploymentProfile {
  readonly provider: "trigger";
  readonly compatibility: "unverified";
  readonly adapterId: "trigger";
  readonly sdk: "4.5.16";
  readonly dockerImageDigest: "sha256:3563088912cf4b880602d99815ddd787274c4ce5fc77738adf1e5bad287fbd1e";
  readonly dockerDurableSleep: false;
  readonly managedStatus: "not-tested";
  readonly scheduleVariants: readonly string[];
}

export const deploymentProfile: TriggerDeploymentProfile = Object.freeze({
  provider: "trigger",
  compatibility: "unverified",
  adapterId: "trigger",
  sdk: "4.5.16",
  dockerImageDigest: "sha256:3563088912cf4b880602d99815ddd787274c4ce5fc77738adf1e5bad287fbd1e",
  dockerDurableSleep: false,
  managedStatus: "not-tested",
  scheduleVariants: [],
});
