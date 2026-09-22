import type { TaskObservation, TaskStreamSchemas } from "./task-types.js";

export function copyObservation(
  value: unknown,
  progress: unknown,
  streams: TaskStreamSchemas | undefined,
): TaskObservation | undefined {
  const declaredStreamNames = streams === undefined ? [] : Object.keys(streams);
  if (value === undefined) {
    if (progress === undefined && declaredStreamNames.length === 0) return undefined;
    return Object.freeze({
      ...(progress === undefined ? {} : { progress: "live" as const }),
      ...(declaredStreamNames.length === 0
        ? {}
        : {
            streams: Object.freeze(
              Object.fromEntries(declaredStreamNames.map((name) => [name, "live" as const])),
            ),
          }),
    }) as TaskObservation;
  }
  if (!isRecord(value)) throw new TypeError("Task observation must be an object");
  if (value.progress !== undefined && value.progress !== "live" && value.progress !== "durable") {
    throw new TypeError('observation.progress must be "live" or "durable"');
  }
  if (value.progress !== undefined && progress === undefined) {
    throw new TypeError("Progress observation requires a progress schema");
  }
  let observedStreams: Record<string, "live" | "history"> | undefined;
  if (value.streams !== undefined) {
    if (!isRecord(value.streams) || streams === undefined) {
      throw new TypeError("Observed streams require declared task stream schemas");
    }
    observedStreams = {};
    for (const [name, guarantee] of Object.entries(value.streams)) {
      if (!(name in streams)) throw new TypeError(`Undeclared observed stream "${name}"`);
      if (guarantee !== "live" && guarantee !== "history") {
        throw new TypeError(`Invalid observation guarantee for stream "${name}"`);
      }
      observedStreams[name] = guarantee;
    }
  } else if (declaredStreamNames.length > 0) {
    observedStreams = Object.fromEntries(
      declaredStreamNames.map((name) => [name, "live" as const]),
    );
  }
  return Object.freeze({
    ...(value.progress === undefined
      ? progress === undefined
        ? {}
        : { progress: "live" as const }
      : { progress: value.progress }),
    ...(observedStreams === undefined ? {} : { streams: Object.freeze(observedStreams) }),
  }) as TaskObservation;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
