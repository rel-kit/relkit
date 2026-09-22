import type { RunCancellationReceipt, RunHandle, RunRetryReceipt } from "@relkit/contracts/jobs";
import {
  createJobsControls,
  decodeJobWire,
  prepareCanonicalSubmission,
  submitPreparedSubmission,
  validateTaskInput,
} from "@relkit/jobs";
import type { TaskJobNode } from "@relkit/graph";
import type { RouteMaterializationOptions } from "../materialize-routes.js";
import type { RpcContext } from "../rpc.js";
import { assertGrantLive, authorizeJobOperation } from "./authorization.js";
import {
  configFor,
  envelopeInput,
  guardJobRequest,
  operationOptions,
  requiredText,
} from "./common.js";
import {
  assertRunForJob,
  descriptorFor,
  jobError,
  runtimeFor,
  scopedRuntime,
  trustedScopeFor,
} from "./support.js";
import { projectCancellation, projectRetry } from "./projection.js";
import { readRun, validateCanonicalRun } from "./handlers-validation.js";
import { jobPolicy } from "./types.js";

export async function triggerJob(
  options: RouteMaterializationOptions,
  context: RpcContext,
  job: TaskJobNode,
  value: unknown,
  signal?: AbortSignal,
): Promise<RunHandle> {
  const input = envelopeInput(value, ["input", "options", "expectedIdentity"]);
  await guardJobRequest(options, context, input, "trigger");
  const config = configFor(options);
  const descriptor = await descriptorFor(config, job);
  const runtime = await runtimeFor(config, job);
  const validated = await validateTaskInput(descriptor.task.input, input.input);
  const canonicalInput = decodeJobWire(validated.wire);
  const trusted = await trustedScopeFor(config, context, job, "trigger", canonicalInput ?? null);
  const admission = await prepareCanonicalSubmission(
    scopedRuntime(runtime, trusted.scope),
    descriptor.task,
    validated.wire,
    operationOptions(input.options),
    descriptor,
  );
  const authorized = await authorizeJobOperation(
    config,
    context,
    job,
    descriptor,
    "trigger",
    admission.input,
    undefined,
    signal,
  );
  const finalRuntime = scopedRuntime(runtime, authorized.grant.scope);
  const finalAdmission =
    authorized.grant.scope === trusted.scope
      ? admission
      : await prepareCanonicalSubmission(
          finalRuntime,
          descriptor.task,
          validated.wire,
          operationOptions(input.options),
          descriptor,
        );
  assertGrantLive(authorized.grant);
  return submitPreparedSubmission(finalRuntime, finalAdmission, signal);
}

export async function cancelJobRun(
  options: RouteMaterializationOptions,
  context: RpcContext,
  job: TaskJobNode,
  value: unknown,
  signal?: AbortSignal,
): Promise<RunCancellationReceipt> {
  const input = envelopeInput(value, ["runId", "operationId", "reason", "expectedIdentity"]);
  await guardJobRequest(options, context, input, "cancel");
  const config = configFor(options);
  const descriptor = await descriptorFor(config, job);
  const runtime = await runtimeFor(config, job);
  const runId = requiredText(input.runId, "run ID");
  const operationId = requiredText(input.operationId, "operation ID");
  const trusted = await trustedScopeFor(config, context, job, "cancel");
  const initial = await authorizeJobOperation(
    config,
    context,
    job,
    descriptor,
    "cancel",
    undefined,
    undefined,
    signal,
    runId,
  );
  const observed = await readRun(runtime, initial.grant.scope, runId, signal);
  const authorized = await authorizeJobOperation(
    config,
    context,
    job,
    descriptor,
    "cancel",
    undefined,
    observed,
    signal,
    runId,
  );
  assertRunForJob(observed, job, { ...trusted, scope: authorized.grant.scope });
  assertGrantLive(authorized.grant);
  const receipt = await createJobsControls(scopedRuntime(runtime, authorized.grant.scope)).cancel(
    runId,
    {
      operationId,
      ...(input.reason === undefined ? {} : { reason: requiredText(input.reason, "reason") }),
      ...(signal === undefined ? {} : { signal }),
    },
  );
  if (receipt.run !== undefined) {
    if (receipt.run.runId !== runId)
      throw jobError("RELKIT_JOB_ACCESS_DENIED", "Job cancellation receipt is unavailable.");
    assertRunForJob(receipt.run, job, { ...trusted, scope: authorized.grant.scope });
    await validateCanonicalRun(descriptor, receipt.run);
  }
  return projectCancellation(receipt, jobPolicy(job), descriptor);
}

export async function retryJobRun(
  options: RouteMaterializationOptions,
  context: RpcContext,
  job: TaskJobNode,
  value: unknown,
  signal?: AbortSignal,
): Promise<RunRetryReceipt> {
  const input = envelopeInput(value, ["runId", "operationId", "expectedIdentity"]);
  await guardJobRequest(options, context, input, "retry");
  const config = configFor(options);
  const descriptor = await descriptorFor(config, job);
  const runtime = await runtimeFor(config, job);
  const runId = requiredText(input.runId, "run ID");
  const operationId = requiredText(input.operationId, "operation ID");
  const trusted = await trustedScopeFor(config, context, job, "retry");
  const initial = await authorizeJobOperation(
    config,
    context,
    job,
    descriptor,
    "retry",
    undefined,
    undefined,
    signal,
    runId,
  );
  const observed = await readRun(runtime, initial.grant.scope, runId, signal);
  const authorized = await authorizeJobOperation(
    config,
    context,
    job,
    descriptor,
    "retry",
    undefined,
    observed,
    signal,
    runId,
  );
  assertRunForJob(observed, job, { ...trusted, scope: authorized.grant.scope });
  assertGrantLive(authorized.grant);
  const receipt = await createJobsControls(scopedRuntime(runtime, authorized.grant.scope)).retry(
    runId,
    {
      operationId,
      ...(signal === undefined ? {} : { signal }),
    },
  );
  return projectRetry(receipt, job);
}
