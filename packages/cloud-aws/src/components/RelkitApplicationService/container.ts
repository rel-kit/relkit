import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import {
  environmentEntries,
  secretEntries,
  validateMappings,
  type RelkitEnvironmentInput,
  type RelkitSecretInput,
} from "../common.js";

export function containerDefinitions(
  image: pulumi.Input<string>,
  logGroupName: pulumi.Input<string>,
  port: number,
  livenessPath: string,
  stopTimeout: number,
  containerName: string,
  environmentInput?: RelkitEnvironmentInput,
  secretsInput?: RelkitSecretInput,
): pulumi.Output<string> {
  const region = aws.getRegionOutput().name;
  const environment = [...environmentEntries(environmentInput)];
  if (!environment.some(({ name }) => name === "AWS_REGION"))
    environment.push({ name: "AWS_REGION", value: region });
  const secrets = secretEntries(secretsInput);
  validateMappings(environment, secrets);
  return pulumi
    .all([
      image,
      logGroupName,
      region,
      ...environment.map(({ value }) => value),
      ...secrets.map(({ valueFrom }) => valueFrom),
    ])
    .apply((values) => {
      const resolvedImage = values[0] as string;
      const resolvedLogGroup = values[1] as string;
      const resolvedRegion = values[2] as string;
      const environmentValues = environment.map(({ name }, index) => ({
        name,
        value: values[index + 3] as string,
      }));
      const secretValues = secrets.map(({ name }, index) => ({
        name,
        valueFrom: values[index + 3 + environment.length] as string,
      }));
      return JSON.stringify([
        {
          name: containerName,
          image: resolvedImage,
          essential: true,
          user: "1000",
          readonlyRootFilesystem: true,
          stopTimeout,
          portMappings: [{ containerPort: port, hostPort: port, protocol: "tcp" }],
          environment: environmentValues,
          secrets: secretValues,
          healthCheck: {
            command: [
              "CMD-SHELL",
              `bun -e "fetch('http://127.0.0.1:${port}${livenessPath}').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"`,
            ],
            interval: 30,
            timeout: 5,
            retries: 3,
            startPeriod: 30,
          },
          logConfiguration: {
            logDriver: "awslogs",
            options: {
              "awslogs-group": resolvedLogGroup,
              "awslogs-region": resolvedRegion,
              "awslogs-stream-prefix": "relkit",
            },
          },
        },
      ]);
    });
}
