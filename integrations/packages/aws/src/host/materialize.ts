import type { DeploymentHostIntegration } from "@relkit/deploy";
import { network } from "./network.js";
import { service } from "./service.js";
import { hostContext } from "./shared.js";

export const materializeAwsHost: DeploymentHostIntegration["materialize"] = ({
  plan,
  stackName,
}) => {
  const context = hostContext(plan, stackName);
  const foundation = network(context);
  const application = service(context, foundation.network);
  return Object.freeze({
    resources: Object.freeze([...foundation.resources, ...application.resources]),
    network: Object.freeze(foundation.network),
    workload: Object.freeze(application.workload),
    outputs: Object.freeze(application.outputs),
  });
};
