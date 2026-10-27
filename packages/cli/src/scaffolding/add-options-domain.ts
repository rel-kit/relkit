/** Parses callable, event and service add requests using the existing finite validators. */

import type { AddRequest, AddRequestBase, ServiceInclude } from "create-relkit/internal/add-types";
import {
  choice,
  many,
  one,
  optional,
  required,
  usage,
  requiredName,
  type ParsedAddArguments,
} from "./add-options-parser.js";
const DELIVERIES = ["transient", "durable"] as const;
const EXECUTIONS = ["durable", "retryable"] as const;

export function domainRequest(
  parsed: ParsedAddArguments,
  common: AddRequestBase,
): AddRequest | undefined {
  const values = parsed.values;
  switch (parsed.kind) {
    case "service": {
      const include = many(values, "include").map(serviceInclude);
      if (parsed.flags.has("full") && include.length > 0)
        usage("--full and --include are exclusive.");
      return {
        ...common,
        kind: "service",
        name: requiredName(parsed),
        full: parsed.flags.has("full"),
        include,
      };
    }
    case "function":
      return {
        ...common,
        kind: "function",
        name: requiredName(parsed),
        internal: parsed.flags.has("internal"),
      };
    case "error":
      return { ...common, kind: "error", name: requiredName(parsed) };
    case "event":
      return {
        ...common,
        kind: "event",
        name: requiredName(parsed),
        internal: parsed.flags.has("internal"),
        ...optional("profile", one(values, "profile")),
      };
  }
}

export function executionRequest(
  parsed: ParsedAddArguments,
  common: AddRequestBase,
): AddRequest | undefined {
  const values = parsed.values;
  switch (parsed.kind) {
    case "event-function":
      return {
        ...common,
        kind: "event-function",
        name: requiredName(parsed),
        event: required(one(values, "event"), "--event is required."),
        delivery: choice(one(values, "delivery"), "delivery", DELIVERIES, "durable")!,
        ...optional("profile", one(values, "profile")),
      };
    case "task":
      return {
        ...common,
        kind: "task",
        name: requiredName(parsed),
        version: one(values, "version") ?? "1",
        execution: choice(one(values, "execution"), "execution", EXECUTIONS, "durable")!,
      };
    case "job":
      return {
        ...common,
        kind: "job",
        name: requiredName(parsed),
        target: required(one(values, "target"), "--target is required."),
        ...optional("profile", one(values, "profile")),
      };
  }
}

/**
 * Rejects artifact kinds that cannot be included in a service scaffold.
 * @param value - Requested artifact kind.
 * @returns The supported service include; excluded kinds raise a usage error.
 */
function serviceInclude(value: string): ServiceInclude {
  const excluded = new Set(["service", "database", "auth", "inspector", "middleware", "transform"]);
  if (excluded.has(value)) usage(`Unsupported service include: ${value}`);
  return value as ServiceInclude;
}
