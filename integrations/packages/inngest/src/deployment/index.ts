export interface InngestDeploymentProfile {
  readonly provider: "inngest";
  readonly compatibility: "native";
  readonly adapterId: "inngest";
  readonly sdk: "inngest@4.20.0";
  readonly serverImageDigest: string;
  readonly profile: "self-hosted-docker";
}

export const deploymentProfile: InngestDeploymentProfile = Object.freeze({
  provider: "inngest",
  compatibility: "native",
  adapterId: "inngest",
  sdk: "inngest@4.20.0",
  serverImageDigest: "sha256:169c1d84801db304ca3c2c267810c67141c8f17bf7c01557b024a9a02fe67e57",
  profile: "self-hosted-docker",
});
