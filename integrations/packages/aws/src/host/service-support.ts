import {
  deploymentJoin,
  type DeploymentInput,
  type DeploymentResourceOperation,
} from "@relkit/deploy";
import { containerEnvironment } from "./environment.js";
import { type HostContext, output, resource } from "./shared.js";

const ASSUME_ROLE_POLICY = JSON.stringify({
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: { Service: "ecs-tasks.amazonaws.com" },
      Action: "sts:AssumeRole",
    },
  ],
});

export function role(context: HostContext, id: string): DeploymentResourceOperation {
  return resource(
    context,
    id,
    "aws:iam/role:Role",
    { assumeRolePolicy: ASSUME_ROLE_POLICY, tags: context.tags },
    ["arn", "name"],
  );
}

export function container(context: HostContext): Readonly<Record<string, DeploymentInput>> {
  return {
    name: "app",
    image: image(context),
    essential: true,
    portMappings: [{ containerPort: context.plan.http.port, protocol: "tcp" }],
    environment: containerEnvironment(context.plan),
    stopTimeout: 30,
    healthCheck: {
      command: [
        "CMD-SHELL",
        `wget -q -O /dev/null http://127.0.0.1:${context.plan.http.port}${context.plan.http.health.livenessPath} || exit 1`,
      ],
      interval: 30,
      timeout: 5,
      retries: 3,
      startPeriod: 10,
    },
    logConfiguration: {
      logDriver: "awslogs",
      options: {
        "awslogs-group": output("log-group", "name"),
        "awslogs-region": context.region,
        "awslogs-stream-prefix": "relkit",
      },
    },
  };
}

function image(context: HostContext): DeploymentInput {
  const image = context.plan.application.image;
  if (image.digest !== undefined) return `${image.name}@${image.digest}`;
  if (image.name.slice(image.name.lastIndexOf("/") + 1).includes(":")) return image.name;
  const tag = image.tag ?? "latest";
  return image.name.includes("/")
    ? `${image.name}:${tag}`
    : deploymentJoin(output("registry", "repositoryUrl"), `:${tag}`);
}
