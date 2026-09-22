import type {
  DeploymentHostMaterialization,
  DeploymentPlan,
  DeploymentResourceOperation,
} from "@relkit/deploy";
import { deploymentOutput } from "@relkit/deploy";

/** Converts task jobs into provider-native staged operations. No HTTP container is synthesized. */
export function nativeWorkerOperations(
  plan: DeploymentPlan,
  host: Pick<DeploymentHostMaterialization, "resources" | "workload">,
): readonly DeploymentResourceOperation[] {
  const resources: DeploymentResourceOperation[] = [];
  for (const job of plan.jobs) {
    if (job.worker === undefined) continue;
    const prefix = `${job.id}.worker`;
    const hostDependencies = host.resources.map((resource) => resource.id);
    resources.push({
      kind: "deployment-resource",
      id: `${prefix}.publish`,
      type: "relkit:jobs:NativeWorkerPublication",
      name: `${job.logicalName}-worker`,
      inputs: {
        provider: job.worker.provider,
        publication: job.worker.publication,
        taskId: job.worker.taskId,
        taskVersion: job.worker.taskVersion,
        buildId: job.worker.buildId,
        serviceGeneration: job.worker.serviceGeneration,
        runtime: job.worker.runtime,
        stages: job.worker.stages,
        workerRoleArn: host.workload.roleArn,
        configurationNames: job.configurationNames,
      },
      outputs: ["publicationId"],
      dependsOn: hostDependencies,
    });
    resources.push({
      kind: "deployment-resource",
      id: `${prefix}.register`,
      type: "relkit:jobs:NativeDefinitionRegistration",
      name: `${job.logicalName}-definition`,
      inputs: {
        publicationId: deploymentOutput(`${prefix}.publish`, "publicationId"),
        jobId: job.jobId ?? job.id,
        name: job.name ?? job.id,
        taskId: job.worker.taskId,
        taskVersion: job.worker.taskVersion,
        buildId: job.worker.buildId,
      },
      outputs: ["definitionId"],
      dependsOn: [`${prefix}.publish`],
    });
    resources.push({
      kind: "deployment-resource",
      id: `${prefix}.readiness`,
      type: "relkit:jobs:NativeReadinessCheck",
      name: `${job.logicalName}-readiness`,
      inputs: {
        definitionId: deploymentOutput(`${prefix}.register`, "definitionId"),
        taskId: job.worker.taskId,
        buildId: job.worker.buildId,
      },
      outputs: ["ready"],
      dependsOn: [`${prefix}.register`],
    });
    for (const schedule of plan.schedules.filter((entry) => entry.jobId === job.id)) {
      resources.push({
        kind: "deployment-resource",
        id: `${job.id}.${schedule.id}.activate`,
        type: "relkit:jobs:NativeScheduleActivation",
        name: `${schedule.logicalName}-activation`,
        inputs: {
          definitionId: deploymentOutput(`${prefix}.register`, "definitionId"),
          readiness: deploymentOutput(`${prefix}.readiness`, "ready"),
          schedule: schedule.schedule,
        },
        dependsOn: [`${prefix}.readiness`],
      });
    }
  }
  return resources;
}
