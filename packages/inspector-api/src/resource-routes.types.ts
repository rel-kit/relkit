import type { JsonValue } from "@relkit/contracts";
import type { Context } from "hono";
import type { ResolvedActiveGeneration } from "./shared.js";
import type { InspectorProjection } from "./query.types.js";

/** Native Hono ingress wrapper enforcing authorization before optional generation access. */
export type Guard = (
  handler: (context: Context, generation?: ResolvedActiveGeneration) => Promise<Response>,
  includeGeneration?: boolean,
) => (context: Context) => Promise<Response>;

/** Declaration-owned query projection used by resource routes on their reused owner. */
export type Project = (
  generation: ResolvedActiveGeneration | undefined,
  projection: InspectorProjection,
) => Promise<JsonValue>;
