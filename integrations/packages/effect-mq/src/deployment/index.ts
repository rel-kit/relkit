export interface EffectMqDeploymentProfile {
  readonly provider: "effect-mq";
  readonly compatibility: "native";
  readonly adapterId: "effect-mq";
  readonly effect: "4.0.0-rc.115";
  readonly sdk: "effect-mq@0.7.0";
  readonly database: "postgresql";
  readonly durableSleep: false;
}

export const deploymentProfile: EffectMqDeploymentProfile = Object.freeze({
  provider: "effect-mq",
  compatibility: "native",
  adapterId: "effect-mq",
  effect: "4.0.0-rc.115",
  sdk: "effect-mq@0.7.0",
  database: "postgresql",
  durableSleep: false,
});
