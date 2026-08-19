import type { FunctionNode } from "@zsys/graph";
import type { HttpGraphTrigger, OpenApiOperation } from "./generate.js";
import { buildRequest } from "./generate-request.js";
import { buildResponses } from "./generate-response.js";

export function buildOperation(trigger: HttpGraphTrigger, target: FunctionNode): OpenApiOperation {
  const request = buildRequest(trigger.config.request, target.input, trigger.config.path);
  return {
    operationId: trigger.id,
    ...(request.parameters.length === 0 ? {} : { parameters: request.parameters }),
    ...(request.body === undefined ? {} : { requestBody: request.body }),
    responses: buildResponses(trigger.config.responses, target),
    "x-zsys": {
      routeId: trigger.id,
      functionId: target.id,
      middleware: trigger.config.middleware.map((entry) => ({ ...entry })),
      transforms: trigger.config.transforms.map((entry) => entry.id),
    },
  };
}

export function openApiPath(value: string): string {
  return (
    value
      .split("/")
      .map((segment, index) => {
        if (segment.startsWith(":")) return `{${parameterName(segment.slice(1), index)}}`;
        if (segment.startsWith("*"))
          return `{${parameterName(segment.slice(1), index, "wildcard")}}`;
        return segment;
      })
      .join("/") || "/"
  );
}

function parameterName(value: string, index: number, fallback = "param"): string {
  const result = value.replace(/[^A-Za-z0-9_.-]/g, "_");
  return result || `${fallback}${index}`;
}
