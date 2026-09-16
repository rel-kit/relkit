import { schemaType } from "./generate-schema.js";
import type { JobProcedureSource } from "./generate-job-procedures.js";

export function jobProcedureEntrySources(
  sources: readonly JobProcedureSource[],
): readonly string[] {
  if (sources.length === 0) return [];
  const jobs = sources.map((source) => {
    const members: string[] = [];
    if (source.operations.includes("trigger")) {
      members.push(
        `      ${JSON.stringify("trigger")}: oc.input(schema<${triggerInput(source)}>()).output(schema<${runHandleType}>()),`,
      );
    }
    const runs = [
      source.operations.includes("get")
        ? `        ${JSON.stringify("get")}: oc.input(schema<${getInputType}>()).output(schema<${jobSnapshotType(source)}>()),`
        : undefined,
      source.operations.includes("list")
        ? `        ${JSON.stringify("list")}: oc.input(schema<${listInputType}>()).output(schema<${pageType(source)}>()),`
        : undefined,
      source.operations.includes("watch")
        ? `        ${JSON.stringify("watch")}: oc.input(schema<${watchInputType}>()).output(schema<AsyncIterable<${watchFrameType(source)}> >()),`
        : undefined,
      source.operations.includes("stream")
        ? `        ${JSON.stringify("stream")}: oc.input(schema<${streamInputType(source)}>()).output(schema<AsyncIterable<${streamFrameType(source)}> >()),`
        : undefined,
      source.operations.includes("cancel")
        ? `        ${JSON.stringify("cancel")}: oc.input(schema<${cancelInputType}>()).output(schema<${cancelOutputType}>()),`
        : undefined,
      source.operations.includes("retry")
        ? `        ${JSON.stringify("retry")}: oc.input(schema<${retryInputType}>()).output(schema<${retryOutputType}>()),`
        : undefined,
    ].filter((value): value is string => value !== undefined);
    if (runs.length > 0) members.push(`      ${JSON.stringify("runs")}: {`, ...runs, "      },");
    return [`    ${JSON.stringify(source.name)}: {`, ...members, "    },"].join("\n");
  });
  return [`  ${JSON.stringify("jobs")}: {`, ...jobs, "  },"];
}

export function jobSnapshotType(source: JobProcedureSource): string {
  return `import("@relkit/client/jobs").JobSnapshotFor<${schemaType(source.input)}, ${schemaType(source.output)}, ${schemaType(source.progress)}, ${jobFailureType(source.errors)}, ${jobFieldsType(source.fields)}>`;
}

function pageType(source: JobProcedureSource): string {
  return `import("@relkit/contracts/jobs").RunPage<${jobSnapshotType(source)}>`;
}

function watchFrameType(source: JobProcedureSource): string {
  return `import("@relkit/contracts/jobs").RunWatchFrame<${jobSnapshotType(source)}>`;
}

function streamFrameType(source: JobProcedureSource): string {
  return `import("@relkit/contracts/jobs").NamedStreamFrame<${jobStreamItemType(source)}>`;
}

export function jobStreamItemType(source: JobProcedureSource): string {
  const streams = isRecord(source.streams) ? source.streams : {};
  const types = source.streamNames.map((name) => schemaType(streams[name]));
  return types.length === 0 ? "never" : types.join(" | ");
}

export function jobFieldsType(fields: readonly string[]): string {
  return fields.length === 0
    ? "readonly []"
    : `readonly [${fields.map((field) => JSON.stringify(field)).join(", ")}]`;
}

export function jobFailureType(value: unknown): string {
  const errors = Array.isArray(value)
    ? value.flatMap((entry) => {
        if (!isRecord(entry) || typeof entry.id !== "string") return [];
        const data = entry.data === undefined ? undefined : schemaType(entry.data);
        return [
          `{ readonly code: ${JSON.stringify(entry.id)}; readonly message: string${data === undefined ? "" : `; readonly data?: ${data}`} }`,
        ];
      })
    : [];
  return errors.length === 0
    ? 'import("@relkit/contracts/jobs").JobErrorEnvelope'
    : errors.join(" | ");
}

function triggerInput(source: JobProcedureSource): string {
  return `{ readonly input: ${schemaType(source.input)}; readonly options?: import("@relkit/client/jobs").JobTriggerOptions; readonly expectedIdentity?: import("@relkit/contracts").ExpectedClientIdentity }`;
}

const getInputType =
  '{ readonly runId: string; readonly expectedIdentity?: import("@relkit/contracts").ExpectedClientIdentity }';
const listInputType =
  '{ readonly query?: import("@relkit/client/jobs").JobListQuery; readonly expectedIdentity?: import("@relkit/contracts").ExpectedClientIdentity }';
const watchInputType =
  '{ readonly runId: string; readonly after?: string; readonly expectedIdentity?: import("@relkit/contracts").ExpectedClientIdentity }';
const streamInputType = (source: JobProcedureSource): string => {
  const names = source.streamNames.map((name) => JSON.stringify(name)).join(" | ") || "never";
  return `{ readonly runId: string; readonly name: ${names}; readonly after?: string; readonly expectedIdentity?: import("@relkit/contracts").ExpectedClientIdentity }`;
};
const cancelInputType =
  '{ readonly runId: string; readonly operationId: import("@relkit/contracts").OperationId | string; readonly reason?: string; readonly expectedIdentity?: import("@relkit/contracts").ExpectedClientIdentity }';
const retryInputType =
  '{ readonly runId: string; readonly operationId: import("@relkit/contracts").OperationId | string; readonly expectedIdentity?: import("@relkit/contracts").ExpectedClientIdentity }';
const runHandleType = 'import("@relkit/contracts/jobs").RunHandle';
const cancelOutputType = 'import("@relkit/contracts/jobs").RunCancellationReceipt';
const retryOutputType = 'import("@relkit/contracts/jobs").RunRetryReceipt';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
